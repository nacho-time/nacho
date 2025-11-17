import { createSignal } from 'solid-js';
import { AiOutlineCloudUpload } from 'solid-icons/ai';
import { A, useNavigate } from '@solidjs/router';

const DropTorrent = () => {
  const [isDragActive, setIsDragActive] = createSignal(false);
  const navigate = useNavigate();
  let fileInputRef: HTMLInputElement | undefined;

  // Drag and drop handlers
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      navigate('/stream', { state: { file } });
    }
  };

  // File input handler
  const onFileSelect = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      navigate('/stream', { state: { file } });
    }
  };

  return (
    <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-neutral-900 to-stone-900">
      <A href="/" class="absolute top-4 left-4 text-blue-400 hover:underline">&#8592; Back to Home</A>
      <div
        class={`w-full max-w-2xl h-[60vh] flex flex-col items-center justify-center border-4 rounded-3xl border-dashed transition-colors duration-200 ${isDragActive() ? 'border-blue-400 bg-blue-950/30' : 'border-neutral-500 bg-neutral-800/60'}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <AiOutlineCloudUpload class="w-20 h-20 text-yellow-800 mb-4 pointer-events-none" />
        <div class="text-2xl text-white font-semibold mb-2 pointer-events-none">Drop files here</div>
        <div class="text-neutral-400 mb-4 pointer-events-none">or click to browse</div>
        
        <input
          ref={fileInputRef}
          type="file"
          class="hidden"
          onChange={onFileSelect}
        />
        <button
          type="button"
          onClick={() => fileInputRef?.click()}
          class="px-6 py-2 rounded-lg border border-neutral-600 bg-neutral-900 text-white font-medium hover:bg-neutral-800 hover:border-blue-400 transition-colors duration-200 pointer-events-auto"
        >
          Choose File
        </button>
      </div>
    </div>
  );
};

export default DropTorrent;
