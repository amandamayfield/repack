import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import ItemForm from "./ItemForm";

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

test("after adding, the cursor is back in an empty Item name field", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<ItemForm onSubmit={onSubmit} submitLabel="Add item" />);

  await userEvent.type(screen.getByLabelText("Item name"), "Boots");
  await userEvent.click(screen.getByRole("button", { name: "Add item" }));

  const name = screen.getByLabelText("Item name");
  await waitFor(() => expect(name).toHaveFocus());
  expect(name).toHaveValue("");
});

test("the cursor stays in the field while the item saves", async () => {
  const save = deferred();
  render(<ItemForm onSubmit={() => save.promise} submitLabel="Add item" />);
  const name = screen.getByLabelText("Item name");

  await userEvent.type(name, "Boots{Enter}");

  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(name).toHaveFocus();
  expect(name).not.toBeDisabled();
  expect(name).toHaveAttribute("readonly");
  save.resolve();
  await waitFor(() => expect(name).toHaveValue(""));
});

test("pressing Enter again while saving adds the item once", async () => {
  const save = deferred();
  const onSubmit = vi.fn(() => save.promise);
  render(<ItemForm onSubmit={onSubmit} submitLabel="Add item" />);

  await userEvent.type(screen.getByLabelText("Item name"), "Boots{Enter}");
  await userEvent.keyboard("{Enter}");

  expect(onSubmit).toHaveBeenCalledTimes(1);
  save.resolve();
});

test("a failed add keeps what was typed", async () => {
  const onSubmit = vi.fn().mockRejectedValue(new Error("offline"));
  render(<ItemForm onSubmit={onSubmit} submitLabel="Add item" />);
  const name = screen.getByLabelText("Item name");

  await userEvent.type(name, "Boots{Enter}");

  expect(
    await screen.findByText("Couldn't save the item. Try again."),
  ).toBeInTheDocument();
  expect(name).toHaveValue("Boots");
  expect(name).toHaveFocus();
});

test("the quantity field asks phones for the number pad", () => {
  render(<ItemForm onSubmit={vi.fn()} />);

  expect(screen.getByLabelText("Quantity (optional)")).toHaveAttribute(
    "inputmode",
    "numeric",
  );
});
