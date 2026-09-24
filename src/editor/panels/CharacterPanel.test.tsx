import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach } from "vitest";
import { createInitialDirectorState, useDirectorStore } from "../store/directorStore";
import { CharacterPanel } from "./CharacterPanel";

beforeEach(() => {
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...createInitialDirectorState(),
    selectedObjectId: "char_default_a",
  });
});

it("renders the approved role property order", () => {
  render(<CharacterPanel />);

  expect(screen.getByLabelText("角色名称")).toBeInTheDocument();
  expect(screen.getByLabelText("角色位置 X")).toBeInTheDocument();
  expect(screen.getByLabelText("角色旋转 X")).toBeInTheDocument();
  expect(screen.getByLabelText("角色缩放 X")).toBeInTheDocument();
  expect(screen.getByLabelText("角色统一缩放")).toBeInTheDocument();
  expect(screen.getByLabelText("角色颜色")).toBeInTheDocument();
});

it("keeps character creation-only body type controls out of the role property panel", () => {
  render(<CharacterPanel />);

  const content = document.querySelector(".right-inspector-content");
  expect(content).toBeInTheDocument();

  const labels = Array.from(content?.querySelectorAll(".inspector-field-label, .inspector-section h3") ?? []).map((item) =>
    item.textContent?.trim()
  );

  expect(labels).toEqual(["名称", "位置", "旋转", "缩放", "统一缩放", "颜色"]);
  expect(screen.queryByText("体型")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "二头身" })).not.toBeInTheDocument();
});

it("keeps role axis labels exactly 10px above their coordinate rows", () => {
  render(<CharacterPanel />);

  ["位置", "旋转", "缩放"].forEach((label) => {
    const group = screen.getByRole("group", { name: label });

    expect(group).toHaveClass("inspector-axis-group");
    expect(group.tagName).toBe("DIV");
  });
});

it("uses the provided right inspector layout for role properties", () => {
  const { container } = render(<CharacterPanel />);

  expect(screen.getByLabelText("角色右侧属性面板")).toHaveClass("right-inspector", "character-inspector");
  expect(container.querySelector(".right-inspector-header")).not.toBeInTheDocument();
  expect(container.querySelector(".right-inspector-tabs")).toBeInTheDocument();
  expect(container.querySelector(".right-inspector-content")).toBeInTheDocument();

  const positionX = screen.getByLabelText("角色位置 X").closest(".inspector-range-field");
  const colorRow = screen.getByLabelText("角色颜色 HEX").closest(".inspector-color-row");

  expect(positionX).toBeInTheDocument();
  expect(within(positionX as HTMLElement).getByText("X")).toHaveClass("inspector-range-axis");
  expect(colorRow).toBeInTheDocument();
  expect(screen.getByLabelText("角色颜色")).toHaveClass("inspector-color-swatch");
});

it("marks the pose adjustment section for the compact character inspector layout", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "姿势" }));

  expect(screen.getByText("姿势预设").closest(".inspector-section")).toHaveClass("pose-preset-section");
  expect(screen.getByText("姿势调节").closest(".inspector-section")).toHaveClass("pose-adjust-section");
});

it("nudges axis values from the number input stepper", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.click(screen.getByLabelText("角色位置 Y 增加"));
  await user.click(screen.getByLabelText("角色位置 Y 增加"));

  const role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");

  expect(role?.transform.position[1]).toBeCloseTo(0.2);

  await user.click(screen.getByLabelText("角色位置 Y 减少"));

  expect(
    useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a")?.transform.position[1]
  ).toBeCloseTo(0.1);
});

it("accepts a leading minus sign while typing axis values", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  const input = screen.getByLabelText("角色位置 X");

  await user.clear(input);
  await user.type(input, "-2.5");

  const role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");

  expect(role?.transform.position[0]).toBe(-2.5);
  expect(input).toHaveValue(-2.5);
});

it("adjusts role position through the per-axis slider rows", () => {
  render(<CharacterPanel />);

  fireEvent.change(screen.getByLabelText("角色位置 X 滑杆"), { target: { value: "2" } });

  const role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");
  expect(role?.transform.position[0]).toBe(2);
  expect(screen.getByLabelText("角色位置 X")).toHaveValue(2);
});

it("updates the selected role name and uniform scale", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.clear(screen.getByLabelText("角色名称"));
  await user.type(screen.getByLabelText("角色名称"), "主角");
  await user.clear(screen.getByLabelText("角色统一缩放"));
  await user.type(screen.getByLabelText("角色统一缩放"), "1.2");

  const role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");
  expect(role?.name).toBe("主角");
  expect(role?.transform.scale).toEqual([1.2, 1.2, 1.2]);
});

it("updates role rotation, per-axis scale, and hex color fields", async () => {
  const user = userEvent.setup();
  render(<CharacterPanel />);

  await user.clear(screen.getByLabelText("角色旋转 Y"));
  await user.type(screen.getByLabelText("角色旋转 Y"), "15");
  await user.clear(screen.getByLabelText("角色缩放 Z"));
  await user.type(screen.getByLabelText("角色缩放 Z"), "1.4");
  await user.clear(screen.getByLabelText("角色颜色 HEX"));
  await user.type(screen.getByLabelText("角色颜色 HEX"), "#123456");

  const role = useDirectorStore.getState().project.objects.find((item) => item.id === "char_default_a");
  expect(role?.transform.rotation).toEqual([0, 15, 0]);
  expect(role?.transform.scale).toEqual([1, 1, 1.4]);
  expect(role?.color).toBe("#123456");
});

it("updates every member in a selected crowd group from the property panel", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().addCrowdCharacters({ rows: 2, columns: 2, spacing: 1.2 });
  useDirectorStore.getState().selectCrowd("crowd_1");

  render(<CharacterPanel />);

  await user.clear(screen.getByLabelText("角色颜色 HEX"));
  await user.type(screen.getByLabelText("角色颜色 HEX"), "#123456");

  const crowdMembers = useDirectorStore
    .getState()
    .project.objects.filter((item) => item.kind === "character" && item.crowdId === "crowd_1");

  expect(crowdMembers).toHaveLength(4);
  expect(new Set(crowdMembers.map((item) => item.color))).toEqual(new Set(["#123456"]));
});

it("applies pose presets to every member in a selected crowd group", async () => {
  const user = userEvent.setup();
  useDirectorStore.getState().addCrowdCharacters({ rows: 2, columns: 2, spacing: 1.2 });
  useDirectorStore.getState().selectCrowd("crowd_1");

  render(<CharacterPanel />);

  await user.click(screen.getByRole("button", { name: "姿势" }));
  await user.click(screen.getByRole("button", { name: "T型" }));

  const crowdMembers = useDirectorStore
    .getState()
    .project.objects.filter((item) => item.kind === "character" && item.crowdId === "crowd_1");

  expect(crowdMembers).toHaveLength(4);
  expect(new Set(crowdMembers.map((item) => item.characterRig?.posePresetId))).toEqual(new Set(["t-pose"]));
  expect(new Set(crowdMembers.map((item) => item.characterRig?.controls["leftShoulder.spread"]))).toEqual(new Set([-70]));
});
