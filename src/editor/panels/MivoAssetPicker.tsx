import { useCallback, useEffect, useState, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Search, X } from "lucide-react";
import { fetchMivoAssets, type MivoAsset, type MivoAssetKind, type MivoAssetProvider } from "../mivo/mivoClient";
import { useMivoStore } from "../mivo/mivoStore";

const PROVIDERS: Array<{ id: MivoAssetProvider; label: string }> = [
  { id: "generate", label: "历史创作" },
  { id: "upload", label: "历史上传" },
];

const PAGE_SIZE = 40;

export function MivoAssetPicker({
  open,
  kind,
  maxCount,
  onClose,
  onApply,
}: {
  open: boolean;
  kind: MivoAssetKind;
  maxCount: number;
  onClose: () => void;
  onApply: (assets: MivoAsset[]) => void | Promise<void>;
}) {
  const session = useMivoStore((state) => state.session);
  const [provider, setProvider] = useState<MivoAssetProvider>("generate");
  const [keyword, setKeyword] = useState("");
  const [assets, setAssets] = useState<MivoAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Loads one page; `append` powers the infinite scroll at the bottom of the list. */
  const loadPage = useCallback(
    async (nextProvider: MivoAssetProvider, nextKeyword: string, nextOffset: number, append: boolean) => {
      if (!session) {
        setError("尚未连接 Mivo，请先连接");
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const items = await fetchMivoAssets(session, {
          fileType: kind,
          provider: nextProvider,
          keyword: nextKeyword.trim() || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });

        setAssets((current) => (append ? [...current, ...items] : items));
        setOffset(nextOffset + items.length);
        setHasMore(items.length >= PAGE_SIZE);
      } catch (loadError) {
        setError((loadError as Error).message);
        if (!append) setAssets([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [kind, session]
  );

  const loadAssets = useCallback(
    (nextProvider: MivoAssetProvider, nextKeyword: string) => loadPage(nextProvider, nextKeyword, 0, false),
    [loadPage]
  );

  function handleListScroll(event: UIEvent<HTMLDivElement>) {
    const list = event.currentTarget;

    if (loading || loadingMore || !hasMore || !assets.length) return;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 120) return;

    void loadPage(provider, keyword, offset, true);
  }

  useEffect(() => {
    if (!open) return;

    setSelectedIds([]);
    setKeyword("");
    setOffset(0);
    setHasMore(true);
    void loadAssets(provider, "");
    // Reload only when the dialog opens or the kind changes; provider tabs reload explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  if (!open || typeof document === "undefined") return null;

  const singleSelect = kind === "image";

  function toggleSelection(asset: MivoAsset) {
    if (singleSelect) return;

    setSelectedIds((current) => {
      if (current.includes(asset.fileId)) return current.filter((id) => id !== asset.fileId);
      if (current.length >= maxCount) return current;

      return [...current, asset.fileId];
    });
  }

  async function handleApply(assetsToApply: MivoAsset[]) {
    if (!assetsToApply.length) return;

    setApplying(true);

    try {
      await onApply(assetsToApply);
      onClose();
    } catch (applyError) {
      setError((applyError as Error).message);
    } finally {
      setApplying(false);
    }
  }

  const selectedAssets = assets.filter((asset) => selectedIds.includes(asset.fileId));
  const typeLabel = kind === "model" ? "模型" : "全景图";

  return createPortal(
    <div className="mivo-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label={`从 Mivo 选择${typeLabel}`}
        aria-modal="true"
        className="mivo-dialog mivo-picker"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mivo-dialog-header">
          <span className="mivo-dialog-title">
            选择{typeLabel}
            {singleSelect ? "" : `（${selectedIds.length}/${maxCount}）`}
          </span>
          <button aria-label="关闭资源选择" className="mivo-dialog-close" type="button" onClick={onClose}>
            <X aria-hidden="true" size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="mivo-picker-toolbar">
          <div className="mivo-picker-tabs" role="tablist" aria-label="资源来源">
            {PROVIDERS.map((item) => (
              <button
                key={item.id}
                aria-selected={provider === item.id}
                className={`mivo-picker-tab${provider === item.id ? " is-active" : ""}`}
                role="tab"
                type="button"
                onClick={() => {
                  setProvider(item.id);
                  void loadAssets(item.id, keyword);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="mivo-picker-search">
            <Search aria-hidden="true" size={14} strokeWidth={1.9} />
            <input
              aria-label={`搜索${typeLabel}`}
              className="mivo-input mivo-picker-search-input"
              placeholder="搜索名称"
              value={keyword}
              onChange={(event) => setKeyword(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadAssets(provider, keyword);
              }}
            />
          </label>
        </div>

        <div className="mivo-picker-body" onScroll={handleListScroll}>
          {loading ? (
            <div className="mivo-picker-status">
              <Loader2 aria-hidden="true" className="mivo-spin" size={18} strokeWidth={2} />
              正在读取 Mivo 资源…
            </div>
          ) : error ? (
            <p className="mivo-dialog-error">{error}</p>
          ) : assets.length === 0 ? (
            <div className="mivo-picker-status">没有找到可用的{typeLabel}</div>
          ) : (
            <div className="mivo-picker-grid" role="list">
              {assets.map((asset) => {
                const selected = selectedIds.includes(asset.fileId);

                return (
                  <button
                    key={asset.fileId}
                    aria-label={`选择 ${asset.name}`}
                    aria-pressed={selected}
                    className={`mivo-picker-card${selected ? " is-selected" : ""}`}
                    role="listitem"
                    type="button"
                    onClick={() => {
                      if (singleSelect) {
                        void handleApply([asset]);
                        return;
                      }

                      toggleSelection(asset);
                    }}
                  >
                    <span className="mivo-picker-thumb">
                      {asset.thumbnail ? (
                        <img alt="" aria-hidden="true" loading="lazy" src={asset.thumbnail} />
                      ) : null}
                      {selected ? (
                        <span className="mivo-picker-check">
                          <Check aria-hidden="true" size={14} strokeWidth={3} />
                        </span>
                      ) : null}
                    </span>
                    <span className="mivo-picker-name">{asset.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          {loadingMore ? (
            <div className="mivo-picker-more">
              <Loader2 aria-hidden="true" className="mivo-spin" size={14} strokeWidth={2} />
              加载更多…
            </div>
          ) : null}
        </div>

        {singleSelect ? null : (
          <footer className="mivo-picker-footer">
            <span className="mivo-picker-hint">单次最多选择 {maxCount} 个{typeLabel}</span>
            <div className="mivo-dialog-actions">
              <button className="mivo-button mivo-button-ghost" type="button" onClick={onClose}>
                取消
              </button>
              <button
                className="mivo-button mivo-button-primary"
                disabled={!selectedAssets.length || applying}
                type="button"
                onClick={() => void handleApply(selectedAssets)}
              >
                {applying ? <Loader2 aria-hidden="true" className="mivo-spin" size={14} strokeWidth={2} /> : null}
                导入选中（{selectedAssets.length}）
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
