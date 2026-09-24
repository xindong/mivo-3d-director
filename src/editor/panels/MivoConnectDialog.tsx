import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, LogOut, X } from "lucide-react";
import { useMivoStore } from "../mivo/mivoStore";
import mivoLogoUrl from "../../assets/mivo-logo.svg";

export function MivoConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useMivoStore((state) => state.status);
  const error = useMivoStore((state) => state.error);
  const apiKey = useMivoStore((state) => state.apiKey);
  const connect = useMivoStore((state) => state.connect);
  const disconnect = useMivoStore((state) => state.disconnect);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!open) return;

    setDraft("");
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const connecting = status === "connecting";
  const connected = status === "connected";

  async function handleConnect() {
    const ok = await connect(draft);

    if (ok) onClose();
  }

  return createPortal(
    <div className="mivo-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label="连接 Mivo"
        aria-modal="true"
        className="mivo-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mivo-dialog-header">
          <span className="mivo-dialog-title">
            <img alt="" aria-hidden="true" className="mivo-logo-mark" src={mivoLogoUrl} />
            连接 Mivo
          </span>
          <button aria-label="关闭连接窗口" className="mivo-dialog-close" type="button" onClick={onClose}>
            <X aria-hidden="true" size={16} strokeWidth={2} />
          </button>
        </header>

        {connected ? (
          <div className="mivo-dialog-body">
            <p className="mivo-dialog-hint">已连接 Mivo，可直接从资源库导入模型与全景图。</p>
            <p className="mivo-dialog-meta">当前 API Key：{`${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`}</p>
            <div className="mivo-dialog-actions">
              <button className="mivo-button mivo-button-ghost" type="button" onClick={onClose}>
                关闭
              </button>
              <button
                className="mivo-button mivo-button-danger"
                type="button"
                onClick={() => {
                  disconnect();
                  onClose();
                }}
              >
                <LogOut aria-hidden="true" size={14} strokeWidth={2} />
                断开连接
              </button>
            </div>
          </div>
        ) : (
          <div className="mivo-dialog-body">
            <label className="mivo-field">
              <span className="mivo-field-label">Mivo API Key</span>
              <input
                aria-label="Mivo API Key"
                autoFocus
                className="mivo-input"
                placeholder="粘贴 Mivo API Key"
                type="password"
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleConnect();
                }}
              />
            </label>
            <p className="mivo-dialog-hint">用于从 Mivo 资源库读取模型与全景图，凭证只保存在本机浏览器。</p>
            {status === "error" && error ? <p className="mivo-dialog-error">{error}</p> : null}
            <div className="mivo-dialog-actions">
              <button className="mivo-button mivo-button-ghost" type="button" onClick={onClose}>
                取消
              </button>
              <button
                className="mivo-button mivo-button-primary"
                disabled={connecting}
                type="button"
                onClick={() => void handleConnect()}
              >
                {connecting ? <Loader2 aria-hidden="true" className="mivo-spin" size={14} strokeWidth={2} /> : null}
                连接
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
