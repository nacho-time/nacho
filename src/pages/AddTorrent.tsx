import { Component, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { extractImdbCode, isValidImdbCode } from "../lib/torrentDb";

type AddTorrentProps = {
  onSuccess: () => void;
};

const AddTorrent: Component<AddTorrentProps> = (props) => {
  const [isDragging, setIsDragging] = createSignal(false);
  const [isUploading, setIsUploading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);
  const [imdbCode, setImdbCode] = createSignal<string>("");

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    setSuccess(null);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) {
      setError("No file dropped");
      return;
    }

    const file = files[0];
    if (!file.name.endsWith(".torrent")) {
      setError("Please drop a .torrent file");
      return;
    }

    await uploadTorrent(file);
  };

  const handleFileInput = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith(".torrent")) {
      setError("Please select a .torrent file");
      return;
    }

    await uploadTorrent(file);
  };

  const uploadTorrent = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      // Read file as base64
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const base64 = btoa(String.fromCharCode(...bytes));

      // Try to extract IMDB code from filename if not provided
      const finalImdbCode = imdbCode().trim() || extractImdbCode(file.name);

      // Add torrent via Tauri command
      const result: any = await invoke("torrent_create_from_base64_file", {
        contents: base64,
        opts: { overwrite: true },
      });

      // If we have an IMDB code and the torrent was created, associate it
      if (finalImdbCode && result.id && isValidImdbCode(finalImdbCode)) {
        try {
          await invoke("set_torrent_imdb_code", {
            id: result.id,
            imdbCode: finalImdbCode,
          });
          console.log(`Associated IMDB code ${finalImdbCode} with torrent`);
        } catch (e) {
          console.warn("Failed to set IMDB code:", e);
        }
      }

      console.log("Torrent added:", result);
      setSuccess(`Successfully added torrent: ${file.name}`);

      // Reset form
      setImdbCode("");

      // Redirect to downloads tab after 1 second
      setTimeout(() => {
        props.onSuccess();
      }, 1000);
    } catch (e: any) {
      console.error("Failed to add torrent:", e);
      setError(e?.toString?.() ?? "Failed to add torrent");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div class="bg-neutral-800/60 rounded-xl p-6 border border-neutral-700">
      <h2 class="text-xl font-bold text-white mb-4">Add Custom Torrent</h2>

      {error() && (
        <div class="text-red-400 bg-red-950/40 border border-red-700 rounded p-4 mb-4">
          {error()}
        </div>
      )}

      {success() && (
        <div class="text-green-400 bg-green-950/40 border border-green-700 rounded p-4 mb-4">
          {success()}
        </div>
      )}

      {/* IMDB Code Input */}
      <div class="mb-6">
        <label class="block text-sm font-medium text-neutral-300 mb-2">
          IMDB Code (Optional)
        </label>
        <input
          type="text"
          placeholder="e.g., tt1234567"
          value={imdbCode()}
          onInput={(e) => setImdbCode(e.currentTarget.value)}
          class="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p class="text-neutral-500 text-xs mt-1">
          If provided, this torrent will be associated with the IMDB entry for
          easy library management
        </p>
      </div>

      <div
        class={`relative border-2 border-dashed rounded-xl p-12 transition-all ${
          isDragging()
            ? "border-blue-500 bg-blue-950/20"
            : "border-neutral-600 bg-neutral-900/40 hover:border-neutral-500"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div class="flex flex-col items-center justify-center gap-4">
          {isUploading() ? (
            <>
              <svg
                class="animate-spin h-16 w-16 text-blue-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <p class="text-neutral-300 text-lg font-medium">
                Adding torrent...
              </p>
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-16 w-16 text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div class="text-center">
                <p class="text-neutral-300 text-lg font-medium mb-2">
                  Drop your .torrent file here
                </p>
                <p class="text-neutral-500 text-sm mb-4">or click to browse</p>
                <label class="cursor-pointer">
                  <span class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors inline-block">
                    Browse Files
                  </span>
                  <input
                    type="file"
                    accept=".torrent"
                    class="hidden"
                    onChange={handleFileInput}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      <div class="mt-6 bg-neutral-900/60 rounded-lg p-4 border border-neutral-700">
        <h3 class="text-white font-semibold mb-2">Instructions</h3>
        <ul class="text-neutral-400 text-sm space-y-1 list-disc list-inside">
          <li>Drag and drop a .torrent file into the area above</li>
          <li>
            Or click "Browse Files" to select a torrent from your computer
          </li>
          <li>The torrent will be automatically added to your downloads</li>
          <li>You'll be redirected to the Downloads tab to monitor progress</li>
        </ul>
      </div>
    </div>
  );
};

export default AddTorrent;
