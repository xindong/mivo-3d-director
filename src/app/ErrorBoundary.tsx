import { Component, type ErrorInfo, type ReactNode } from "react";

const DIRECTOR_DESK_STORAGE_PREFIX = "storyai-3d-director";

export function clearDirectorDeskStorage() {
  try {
    const storage = window.localStorage;
    const keys = Object.keys(storage).filter((key) => key.startsWith(DIRECTOR_DESK_STORAGE_PREFIX));

    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage may be unavailable (private mode); reloading still recovers the app.
  }
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("导演台运行异常", error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    clearDirectorDeskStorage();
    window.location.reload();
  };

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <div className="app-error-boundary" role="alert">
        <strong>导演台遇到问题</strong>
        <span>{error.message || "渲染过程中出现未预期的错误"}</span>
        <div className="app-error-actions">
          <button className="ui-icon-button" type="button" onClick={this.handleReload}>
            重新加载
          </button>
          <button className="ui-icon-button" type="button" onClick={this.handleReset}>
            重置场景数据
          </button>
        </div>
      </div>
    );
  }
}
