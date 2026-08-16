import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useFetch } from "./useFetch";
import { api } from "../api/client";

vi.mock("../api/client", () => ({ api: vi.fn() }));

beforeEach(() => {
  api.mockReset();
});

test("fetches data for the given path", async () => {
  api.mockResolvedValue({ id: 1, name: "Beach" });

  const { result } = renderHook(() => useFetch("/trips/1/"));
  expect(result.current.loading).toBe(true);

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ id: 1, name: "Beach" });
  expect(result.current.error).toBe(null);
  expect(api).toHaveBeenCalledWith("/trips/1/");
});

test("reload triggers a refetch of the same path", async () => {
  api.mockResolvedValue({ ok: true });

  const { result } = renderHook(() => useFetch("/trips/"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(api).toHaveBeenCalledTimes(1);

  act(() => result.current.reload());
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
});

test("exposes the error and leaves data null when the request fails", async () => {
  api.mockRejectedValue(new Error("500"));

  const { result } = renderHook(() => useFetch("/trips/"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toEqual(new Error("500"));
  expect(result.current.data).toBe(null);
});
