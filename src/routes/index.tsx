import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({ component: Home })

const MAX_IMAGES = 5

type ItemState =
  | { type: "processing" }
  | { type: "done"; originalUrl: string; processedUrl: string }
  | { type: "error"; message: string }

type ImageItem = {
  uid: string
  file: File
  preview: string
  state: ItemState
}

let uidCounter = 0
const nextUid = () => String(++uidCounter)

async function processFile(file: File): Promise<{ originalUrl: string; processedUrl: string }> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch("/api/process", { method: "POST", body: form })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  const data = (await res.json()) as { original_url: string; processed_url: string }
  return { originalUrl: data.original_url, processedUrl: data.processed_url }
}

function Home() {
  const [items, setItems] = useState<ImageItem[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const updateItem = (uid: string, patch: Partial<ImageItem> | ((item: ImageItem) => Partial<ImageItem>)) =>
    setItems((prev) =>
      prev.map((it) => (it.uid === uid ? { ...it, ...(typeof patch === "function" ? patch(it) : patch) } : it)),
    )

  const addFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"))
    if (imageFiles.length === 0) return

    setItems((prev) => {
      const slots = MAX_IMAGES - prev.length
      if (slots <= 0) return prev
      const toAdd = imageFiles.slice(0, slots)
      const newItems: ImageItem[] = toAdd.map((file) => ({
        uid: nextUid(),
        file,
        preview: URL.createObjectURL(file),
        state: { type: "processing" },
      }))

      // Kick off processing for each
      newItems.forEach((item) => {
        processFile(item.file)
          .then(({ originalUrl, processedUrl }) =>
            updateItem(item.uid, { state: { type: "done", originalUrl, processedUrl } }),
          )
          .catch((e) =>
            updateItem(item.uid, {
              state: { type: "error", message: e instanceof Error ? e.message : "Unknown error" },
            }),
          )
      })

      return [...prev, ...newItems]
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const removeItem = (uid: string) =>
    setItems((prev) => prev.filter((it) => it.uid !== uid))

  const reset = () => {
    setItems([])
    if (inputRef.current) inputRef.current.value = ""
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ""
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }

  const doneItems = items.filter((it) => it.state.type === "done")
  const slotsLeft = MAX_IMAGES - items.length
  const allSettled = items.length > 0 && items.every((it) => it.state.type !== "processing")

  return (
    <main className="min-h-svh bg-background flex flex-col items-center py-14 px-4">
      <div className="w-full max-w-4xl flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Product Image Cleaner</h1>
          <p className="text-muted-foreground text-sm">
            Upload up to {MAX_IMAGES} product photos — we remove the background &amp; hands, fix
            low-light, and export clean white-background images ready for your store.
          </p>
        </header>

        {/* Upload zone — shown when slots are available */}
        {slotsLeft > 0 && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload images"
            className={[
              "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed",
              "min-h-48 cursor-pointer transition-colors select-none",
              dragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/60 hover:bg-muted/40",
            ].join(" ")}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={onFileChange}
            />
            <svg className="size-9 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm text-muted-foreground">
              Drag &amp; drop or <span className="text-foreground underline underline-offset-2">click to browse</span>
            </span>
            <span className="text-xs text-muted-foreground/70">
              JPEG, PNG, WebP · max 20 MB each ·{" "}
              {slotsLeft === MAX_IMAGES
                ? `up to ${MAX_IMAGES} images`
                : `${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} remaining`}
            </span>
          </div>
        )}

        {/* Image grid */}
        {items.length > 0 && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <ImageCard key={item.uid} item={item} onRemove={() => removeItem(item.uid)} />
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
              {doneItems.length > 1 && (
                <Button
                  onClick={() => {
                    doneItems.forEach((it) => {
                      if (it.state.type !== "done") return
                      const a = document.createElement("a")
                      a.href = it.state.processedUrl
                      a.download = `product-${it.uid}.jpg`
                      a.target = "_blank"
                      a.click()
                    })
                  }}
                >
                  Download all ({doneItems.length})
                </Button>
              )}
              {allSettled && (
                <Button variant="outline" onClick={reset}>
                  Clear &amp; start over
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground -mt-3">
              Images are automatically removed from the server after 30 minutes.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function ImageCard({ item, onRemove }: { item: ImageItem; onRemove: () => void }) {
  const { state, preview, uid } = item

  return (
    <div className="rounded-xl border border-border overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-muted px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground truncate">
          {item.file.name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {state.type === "processing" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Spinner /> Processing
            </span>
          )}
          {state.type === "done" && (
            <span className="text-xs text-primary font-medium">Ready</span>
          )}
          {state.type === "error" && (
            <span className="text-xs text-destructive font-medium">Failed</span>
          )}
          <button
            onClick={onRemove}
            aria-label="Remove"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="relative bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] bg-size-[16px_16px] flex items-center justify-center min-h-44 p-2">
        {state.type === "processing" && (
          <>
            <img src={preview} alt="original" className="max-h-40 max-w-full rounded object-contain opacity-30 blur-sm" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner className="size-6" />
            </div>
          </>
        )}

        {state.type === "done" && (
          <img
            src={state.processedUrl}
            alt="processed"
            className="max-h-40 max-w-full rounded object-contain"
            style={{ background: "white" }}
          />
        )}

        {state.type === "error" && (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <img src={preview} alt="original" className="max-h-28 max-w-full rounded object-contain opacity-40" />
            <p className="text-xs text-destructive">{state.message}</p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {state.type === "done" && (
        <div className="px-3 py-2 border-t border-border flex gap-2">
          <a
            href={state.processedUrl}
            download={`product-${uid}.jpg`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button size="sm" className="w-full">Download</Button>
          </a>
        </div>
      )}
    </div>
  )
}

function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin text-muted-foreground`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
