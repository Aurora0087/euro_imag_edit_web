import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({ component: Home })

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

type ProcessState =
  | { type: "idle" }
  | { type: "processing" }
  | { type: "done"; originalUrl: string; processedUrl: string; id: string }
  | { type: "error"; message: string }

function Home() {
  const [state, setState] = useState<ProcessState>({ type: "idle" })
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setState({ type: "error", message: "Please upload an image file." })
      return
    }
    setPreview(URL.createObjectURL(file))
    setState({ type: "processing" })

    const form = new FormData()
    form.append("file", file)

    try {
      const res = await fetch(`${API_URL}/api/process`, { method: "POST", body: form })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { detail?: string }).detail ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { id: string; original_url: string; processed_url: string }
      setState({
        type: "done",
        id: data.id,
        originalUrl: `${API_URL}${data.original_url}`,
        processedUrl: `${API_URL}${data.processed_url}`,
      })
    } catch (e) {
      setState({ type: "error", message: e instanceof Error ? e.message : "Unknown error" })
    }
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const reset = () => {
    setState({ type: "idle" })
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <main className="min-h-svh bg-background flex flex-col items-center py-14 px-4">
      <div className="w-full max-w-3xl flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Product Image Cleaner</h1>
          <p className="text-muted-foreground text-sm">
            Upload a product photo — we remove the background &amp; hands, fix low-light, and export a
            clean white-background image ready for your store.
          </p>
        </header>

        {/* Upload zone */}
        {(state.type === "idle" || state.type === "error") && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload image"
            className={[
              "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed",
              "min-h-56 cursor-pointer transition-colors select-none",
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
              className="sr-only"
              onChange={onFileChange}
            />
            <svg className="size-10 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm text-muted-foreground">
              Drag &amp; drop or <span className="text-foreground underline underline-offset-2">click to browse</span>
            </span>
            <span className="text-xs text-muted-foreground/70">JPEG, PNG, WebP · max 20 MB</span>
          </div>
        )}

        {state.type === "error" && (
          <p className="text-sm text-destructive -mt-4">{state.message}</p>
        )}

        {/* Processing */}
        {state.type === "processing" && (
          <div className="flex flex-col items-center gap-4 py-10">
            {preview && (
              <img
                src={preview}
                alt="Original"
                className="max-h-48 rounded-lg object-contain opacity-50 blur-sm"
              />
            )}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Spinner />
              Processing — removing background, hands &amp; fixing lighting…
            </div>
          </div>
        )}

        {/* Result */}
        {state.type === "done" && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <ResultCard label="Original" url={state.originalUrl} />
              <ResultCard label="Processed" url={state.processedUrl} highlight />
            </div>

            <div className="flex items-center gap-3">
              <a href={state.processedUrl} download={`product-${state.id}.jpg`} target="_blank" rel="noopener noreferrer">
                <Button>Download</Button>
              </a>
              <Button variant="outline" onClick={reset}>Process another</Button>
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

function ResultCard({ label, url, highlight = false }: { label: string; url: string; highlight?: boolean }) {
  return (
    <div className={["rounded-xl border overflow-hidden flex flex-col", highlight ? "border-primary/40 ring-1 ring-primary/20" : "border-border"].join(" ")}>
      <div className="bg-muted px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {highlight && <span className="text-xs text-primary font-medium">Ready</span>}
      </div>
      <div className="bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] bg-size-[20px_20px] flex items-center justify-center min-h-48 p-2">
        <img
          src={url}
          alt={label}
          className="max-h-72 max-w-full rounded object-contain"
          style={{ background: highlight ? "white" : undefined }}
        />
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
