import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";
import { createInitialDirectorState, useDirectorStore } from "../store/directorStore";
import { ScenePanel } from "./ScenePanel";

beforeEach(() => {
  useDirectorStore.setState({
    ...useDirectorStore.getState(),
    ...createInitialDirectorState(),
  });
});

function connectPanorama(fileName = "studio-panorama.jpg") {
  const state = useDirectorStore.getState();

  useDirectorStore.setState({
    ...state,
    project: {
      ...state.project,
      assets: [
        {
          id: "asset_panorama_1",
          kind: "panorama",
          sourceType: "image",
          fileName,
          url: "data:image/jpeg;base64,panorama-preview",
        },
      ],
      panoramaAssetId: "asset_panorama_1",
    },
  });
}

it("uses the provided right inspector layout for scene properties", () => {
  const { container } = render(<ScenePanel />);

  expect(screen.getByLabelText("3D场景右侧属性面板")).toHaveClass("right-inspector", "scene-inspector");
  expect(container.querySelector(".right-inspector-header")).not.toBeInTheDocument();
  expect(screen.queryByText("3D场景")).not.toBeInTheDocument();
  expect(container.querySelector(".right-inspector-content")).toBeInTheDocument();
  expect(screen.getByLabelText("场景平移 X").closest(".inspector-range-field")).toBeInTheDocument();
});

it("renders the scene inspector as scene, panorama, ground, and misc tabs", async () => {
  const user = userEvent.setup();
  render(<ScenePanel />);

  expect(screen.getByRole("button", { name: "场景" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "全景" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "地面" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "其他" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByLabelText("场景平移 X")).toBeInTheDocument();
  expect(screen.queryByLabelText("全景半径")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "全景" }));

  expect(screen.getByLabelText("全景半径")).toBeInTheDocument();
  expect(screen.queryByLabelText("场景平移 X")).not.toBeInTheDocument();
});

it("lays scene switches out in one row and only toggles from the checkbox", async () => {
  const user = userEvent.setup();
  const { container } = render(<ScenePanel />);

  await user.click(screen.getByRole("button", { name: "其他" }));

  const switchRow = container.querySelector(".scene-switch-row");
  const labelText = screen.getByText("角色标签");
  const checkbox = screen.getByLabelText("角色标签");

  expect(switchRow).toBeInTheDocument();
  expect(switchRow?.querySelectorAll(".inspector-toggle-row")).toHaveLength(2);
  expect(checkbox).toBeChecked();

  await user.click(labelText);

  expect(checkbox).toBeChecked();

  await user.click(checkbox);

  expect(checkbox).not.toBeChecked();
});

it("updates scene transform, panorama, and ground controls", async () => {
  const user = userEvent.setup();
  render(<ScenePanel />);

  await user.clear(screen.getByLabelText("场景缩放"));
  await user.type(screen.getByLabelText("场景缩放"), "1.3");
  await user.clear(screen.getByLabelText("场景平移 Y"));
  await user.type(screen.getByLabelText("场景平移 Y"), "2");
  await user.clear(screen.getByLabelText("场景旋转 Z"));
  await user.type(screen.getByLabelText("场景旋转 Z"), "45");

  await user.click(screen.getByRole("button", { name: "全景" }));

  await user.clear(screen.getByLabelText("天空颜色 HEX"));
  await user.type(screen.getByLabelText("天空颜色 HEX"), "#123456");
  await user.clear(screen.getByLabelText("全景旋转"));
  await user.type(screen.getByLabelText("全景旋转"), "30");
  await user.clear(screen.getByLabelText("全景半径"));
  await user.type(screen.getByLabelText("全景半径"), "90");

  await user.click(screen.getByRole("button", { name: "其他" }));

  expect(screen.getByLabelText("显示网格")).toBeChecked();

  await user.click(screen.getByLabelText("角色标签"));
  await user.click(screen.getByLabelText("显示网格"));

  await user.click(screen.getByRole("button", { name: "地面" }));

  await user.clear(screen.getByLabelText("地面透明度"));
  await user.type(screen.getByLabelText("地面透明度"), "0.65");
  await user.clear(screen.getByLabelText("地面高度"));
  await user.type(screen.getByLabelText("地面高度"), "1.2");

  const scene = useDirectorStore.getState().project.scene;
  expect(scene.scale).toBe(1.3);
  expect(scene.position).toEqual([0, 2, 0]);
  expect(scene.rotation).toEqual([0, 0, 45]);
  expect(scene.backgroundColor).toBe("#123456");
  expect(scene.panoramaYaw).toBe(30);
  expect(scene.panoramaRadius).toBe(90);
  expect(scene.showLabels).toBe(false);
  expect(scene.snapToGrid).toBe(false);
  expect(scene.groundOpacity).toBe(0.65);
  expect(scene.groundHeight).toBe(1.2);
});

it("renders a connected panorama as a compact thumbnail card with the file name overlay", async () => {
  const user = userEvent.setup();
  connectPanorama();

  render(<ScenePanel />);

  await user.click(screen.getByRole("button", { name: "全景" }));

  expect(screen.queryByText("已连接全景图: studio-panorama.jpg")).not.toBeInTheDocument();
  expect(screen.queryByText("全景图预览")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("全景图预览卡片")).not.toBeInTheDocument();

  const thumbnailCard = screen.getByLabelText("全景图缩略图卡片");
  const thumbnailImage = screen.getByAltText("studio-panorama.jpg 全景图缩略图");

  expect(thumbnailCard).toHaveClass("panorama-thumbnail-card");
  expect(screen.getByText("studio-panorama.jpg")).toHaveClass("panorama-thumbnail-name");
  expect(thumbnailImage).toHaveClass("panorama-thumbnail-image");
  expect(thumbnailImage).toHaveAttribute("src", "data:image/jpeg;base64,panorama-preview");
});

it("removes the connected panorama when the delete icon is clicked", async () => {
  const user = userEvent.setup();
  connectPanorama();

  render(<ScenePanel />);

  await user.click(screen.getByRole("button", { name: "全景" }));
  await user.click(screen.getByRole("button", { name: "删除全景图" }));

  expect(useDirectorStore.getState().project.panoramaAssetId).toBeNull();
  expect(useDirectorStore.getState().project.assets).toHaveLength(0);
  expect(screen.getByLabelText("全景图连接状态")).toBeInTheDocument();
});

it("renders the disconnected panorama state as a fixed-size dark card", async () => {
  const user = userEvent.setup();
  render(<ScenePanel />);

  await user.click(screen.getByRole("button", { name: "全景" }));

  const panoramaStatus = screen.getByLabelText("全景图连接状态");

  expect(panoramaStatus).toHaveClass("panorama-empty-card");
  expect(screen.getByTestId("panorama-empty-icon")).toBeInTheDocument();
  expect(panoramaStatus).toHaveTextContent("从 Mivo 选择");
});

it("starts the Mivo panorama flow from the empty card and keeps a local entry", async () => {
  const user = userEvent.setup();
  render(<ScenePanel />);

  await user.click(screen.getByRole("button", { name: "全景" }));

  const uploadInput = screen.getByLabelText("上传全景图") as HTMLInputElement;
  const clickSpy = vi.spyOn(uploadInput, "click");

  // The primary action on the empty card goes straight to Mivo (connecting first when needed).
  await user.click(screen.getByLabelText("全景图连接状态"));

  expect(screen.getByRole("dialog", { name: "连接 Mivo" })).toBeInTheDocument();

  // The secondary entry still opens the local file dialog.
  await user.click(screen.getByRole("button", { name: "从本地选择" }));

  expect(clickSpy).toHaveBeenCalledTimes(1);
});

it("shows a floating source menu when a connected panorama thumbnail is clicked", async () => {
  const user = userEvent.setup();
  connectPanorama();

  render(<ScenePanel />);

  await user.click(screen.getByRole("button", { name: "全景" }));
  await user.click(screen.getByLabelText("全景图缩略图卡片"));

  expect(screen.getByRole("menu", { name: "选择全景图来源" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "从 Mivo 选择" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "从本地选择" })).toBeInTheDocument();
});

it("updates panorama radius from both slider and numeric input", async () => {
  const user = userEvent.setup();
  render(<ScenePanel />);

  await user.click(screen.getByRole("button", { name: "全景" }));
  await user.clear(screen.getByLabelText("全景半径"));
  await user.type(screen.getByLabelText("全景半径"), "150");

  expect(useDirectorStore.getState().project.scene.panoramaRadius).toBe(150);
  expect(screen.getByLabelText("全景半径滑杆")).toHaveValue("150");

  fireEvent.change(screen.getByLabelText("全景半径滑杆"), { target: { value: "149" } });

  expect(useDirectorStore.getState().project.scene.panoramaRadius).toBe(149);
  expect(screen.getByLabelText("全景半径")).toHaveValue(149);
});

it("updates panorama yaw and ground height from both sliders and numeric inputs", async () => {
  const user = userEvent.setup();
  render(<ScenePanel />);

  await user.click(screen.getByRole("button", { name: "全景" }));
  await user.clear(screen.getByLabelText("全景旋转"));
  await user.type(screen.getByLabelText("全景旋转"), "45");

  expect(useDirectorStore.getState().project.scene.panoramaYaw).toBe(45);
  expect(screen.getByLabelText("全景旋转滑杆")).toHaveValue("45");

  fireEvent.change(screen.getByLabelText("全景旋转滑杆"), { target: { value: "-30" } });

  expect(useDirectorStore.getState().project.scene.panoramaYaw).toBe(-30);
  expect(screen.getByLabelText("全景旋转")).toHaveValue(-30);

  await user.click(screen.getByRole("button", { name: "地面" }));
  await user.clear(screen.getByLabelText("地面高度"));
  await user.type(screen.getByLabelText("地面高度"), "1.2");

  expect(useDirectorStore.getState().project.scene.groundHeight).toBe(1.2);
  expect(screen.getByLabelText("地面高度滑杆")).toHaveValue("1.2");

  fireEvent.change(screen.getByLabelText("地面高度滑杆"), { target: { value: "-1.5" } });

  expect(useDirectorStore.getState().project.scene.groundHeight).toBe(-1.5);
  expect(screen.getByLabelText("地面高度")).toHaveValue(-1.5);
});

it("keeps the ground switch on the ground tab and hides its fields while ground is off", async () => {
  const user = userEvent.setup();
  render(<ScenePanel />);

  await user.click(screen.getByRole("button", { name: "地面" }));

  expect(screen.getByLabelText("地面")).toBeChecked();
  expect(screen.getByLabelText("地面透明度")).toBeInTheDocument();
  expect(screen.getByLabelText("地面高度")).toBeInTheDocument();

  await user.click(screen.getByLabelText("地面"));

  expect(useDirectorStore.getState().project.scene.showGround).toBe(false);
  expect(screen.queryByLabelText("地面透明度")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("地面高度")).not.toBeInTheDocument();
});

it("updates scene scale from both slider and numeric input", async () => {
  const user = userEvent.setup();
  render(<ScenePanel />);

  expect(screen.getByLabelText("场景缩放滑杆")).toHaveValue("1");

  await user.clear(screen.getByLabelText("场景缩放"));
  await user.type(screen.getByLabelText("场景缩放"), "1.35");

  expect(useDirectorStore.getState().project.scene.scale).toBe(1.35);
  expect(screen.getByLabelText("场景缩放滑杆")).toHaveValue("1.35");

  fireEvent.change(screen.getByLabelText("场景缩放滑杆"), { target: { value: "1.8" } });

  expect(useDirectorStore.getState().project.scene.scale).toBe(1.8);
  expect(screen.getByLabelText("场景缩放")).toHaveValue(1.8);
});

it("exposes scene translate and rotate as per-axis slider rows", () => {
  const { container } = render(<ScenePanel />);

  (["X", "Y", "Z"] as const).forEach((axis) => {
    expect(screen.getByLabelText(`场景平移 ${axis} 滑杆`)).toBeInTheDocument();
    expect(screen.getByLabelText(`场景旋转 ${axis} 滑杆`)).toBeInTheDocument();
  });

  expect(screen.getByText("场景平移")).toBeInTheDocument();
  expect(screen.getByText("场景旋转")).toBeInTheDocument();
  expect(container.querySelectorAll(".inspector-range-axis")).toHaveLength(6);
  expect(container.querySelectorAll(".inspector-axis-group")).toHaveLength(2);
  expect(screen.getByLabelText("场景平移 X").closest(".inspector-range-field")).toBeInTheDocument();
});
