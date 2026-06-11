import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, MutableRefObject } from 'react'
import JSZip from 'jszip'
import {
  Archive,
  CheckCircle2,
  Download,
  FileArchive,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Moon,
  Play,
  RefreshCw,
  Settings2,
  Sun,
  Trash2,
  Type,
  Upload,
  Video,
  XCircle,
} from 'lucide-react'
import type { FFmpeg } from '@ffmpeg/ffmpeg'
import './App.css'

const IMAGE_FORMATS = [
  { value: 'webp', label: 'WebP', extension: 'webp', mime: 'image/webp', quality: true },
  { value: 'jpeg', label: 'JPEG', extension: 'jpg', mime: 'image/jpeg', quality: true },
  { value: 'png', label: 'PNG', extension: 'png', mime: 'image/png', quality: false },
  { value: 'avif', label: 'AVIF', extension: 'avif', mime: 'image/avif', quality: true },
] as const

const VIDEO_FORMATS = [
  { value: 'mp4', label: 'MP4', extension: 'mp4', mime: 'video/mp4' },
  { value: 'webm', label: 'WebM', extension: 'webm', mime: 'video/webm' },
  { value: 'mov', label: 'MOV', extension: 'mov', mime: 'video/quicktime' },
  { value: 'gif', label: 'GIF', extension: 'gif', mime: 'image/gif' },
] as const

const WATERMARK_POSITIONS = [
  { value: 'center-center', label: 'Center center' },
  { value: 'center-top', label: 'Center top' },
  { value: 'center-left', label: 'Center left' },
  { value: 'center-right', label: 'Center right' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
] as const

const WATERMARK_BACKDROPS = [
  { value: 'none', label: 'No overlay' },
  { value: 'dark', label: 'Dark overlay' },
  { value: 'light', label: 'Light overlay' },
] as const

type Mode = 'image' | 'video'
type Theme = 'light' | 'dark'
type FileStatus = 'ready' | 'working' | 'done' | 'failed'
type ImageFormat = (typeof IMAGE_FORMATS)[number]['value']
type VideoFormat = (typeof VIDEO_FORMATS)[number]['value']
type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number]['value']
type WatermarkBackdrop = (typeof WATERMARK_BACKDROPS)[number]['value']
type WatermarkMode = 'text' | 'image'
type FetchFile = (file?: string | File | Blob) => Promise<Uint8Array>

type MediaFile = {
  id: string
  file: File
  previewUrl: string
  status: FileStatus
  error?: string
}

type ConversionResult = {
  id: string
  sourceName: string
  outputName: string
  originalSize: number
  convertedSize: number
  durationMs: number
  blob: Blob
  url: string
  previewType: Mode
}

type ConverterSettings = {
  theme: Theme
  imageFormat: ImageFormat
  videoFormat: VideoFormat
  quality: number
  maxWidth: string
  maxHeight: string
  keepAspect: boolean
  filePrefix: string
  videoMaxWidth: string
  stripAudio: boolean
  watermarkEnabled: boolean
  watermarkMode: WatermarkMode
  watermarkText: string
  watermarkFontSize: string
  watermarkLogoSize: string
  watermarkPosition: WatermarkPosition
  watermarkColor: string
  watermarkWeight: string
  watermarkBackdrop: WatermarkBackdrop
  watermarkOpacity: number
}

type WatermarkLogo = {
  file: File
  previewUrl: string
}

type FfmpegTools = {
  ffmpeg: FFmpeg
  fetchFile: FetchFile
}

type ProgressState = {
  label: string
  current: number
  total: number
  percent: number
}

const DEFAULT_SETTINGS: ConverterSettings = {
  theme: 'dark',
  imageFormat: 'webp',
  videoFormat: 'mp4',
  quality: 0.8,
  maxWidth: '',
  maxHeight: '',
  keepAspect: true,
  filePrefix: 'converted_',
  videoMaxWidth: '1280',
  stripAudio: false,
  watermarkEnabled: false,
  watermarkMode: 'text',
  watermarkText: 'Khawaja Abdul Rehman',
  watermarkFontSize: '48',
  watermarkLogoSize: '160',
  watermarkPosition: 'bottom-right',
  watermarkColor: '#ffffff',
  watermarkWeight: '700',
  watermarkBackdrop: 'dark',
  watermarkOpacity: 0.82,
}

const SETTINGS_KEY = 'react-media-format-converter-settings'
const MAX_IMAGE_FILES = 100
const MAX_VIDEO_FILES = 10

function App() {
  const [mode, setMode] = useState<Mode>('image')
  const [settings, setSettings] = useState<ConverterSettings>(loadSettings)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [results, setResults] = useState<ConversionResult[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [ffmpegMessage, setFfmpegMessage] = useState('')
  const [watermarkLogo, setWatermarkLogo] = useState<WatermarkLogo | null>(null)
  const [progress, setProgress] = useState<ProgressState>({
    label: 'Waiting',
    current: 0,
    total: 0,
    percent: 0,
  })

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const watermarkLogoInputRef = useRef<HTMLInputElement | null>(null)
  const filesRef = useRef<MediaFile[]>([])
  const resultsRef = useRef<ConversionResult[]>([])
  const watermarkLogoRef = useRef<WatermarkLogo | null>(null)
  const ffmpegToolsRef = useRef<FfmpegTools | null>(null)
  const ffmpegLoadRef = useRef<Promise<FfmpegTools> | null>(null)
  const ffmpegLogRef = useRef<string[]>([])
  const progressContextRef = useRef<{ index: number; total: number } | null>(null)

  const imageFormat = IMAGE_FORMATS.find((format) => format.value === settings.imageFormat) ?? IMAGE_FORMATS[0]
  const videoFormat = VIDEO_FORMATS.find((format) => format.value === settings.videoFormat) ?? VIDEO_FORMATS[0]
  const maxFiles = mode === 'image' ? MAX_IMAGE_FILES : MAX_VIDEO_FILES
  const accept = mode === 'image' ? 'image/*' : 'video/*'
  const canConvert = files.length > 0 && !isWorking
  const canDownloadAll = results.length > 0 && !isWorking

  const summary = useMemo(() => {
    const original = results.reduce((total, result) => total + result.originalSize, 0)
    const converted = results.reduce((total, result) => total + result.convertedSize, 0)
    const durationMs = results.reduce((total, result) => total + result.durationMs, 0)
    const saved = original > 0 ? ((original - converted) / original) * 100 : 0
    return { original, converted, durationMs, saved }
  }, [results])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    filesRef.current = files
  }, [files])

  useEffect(() => {
    resultsRef.current = results
  }, [results])

  useEffect(() => {
    watermarkLogoRef.current = watermarkLogo
  }, [watermarkLogo])

  useEffect(() => {
    return () => {
      filesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url))
      if (watermarkLogoRef.current) URL.revokeObjectURL(watermarkLogoRef.current.previewUrl)
      ffmpegToolsRef.current?.ffmpeg.terminate()
    }
  }, [])

  function updateSetting<Key extends keyof ConverterSettings>(key: Key, value: ConverterSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  function resetOutput() {
    resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url))
    resultsRef.current = []
    setResults([])
  }

  function clearFiles() {
    filesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    filesRef.current = []
    setFiles([])
    resetOutput()
    setNotice(null)
    setProgress({ label: 'Waiting', current: 0, total: 0, percent: 0 })
  }

  function changeMode(nextMode: Mode) {
    if (nextMode === mode || isWorking) return
    clearFiles()
    setMode(nextMode)
    setFfmpegMessage('')
  }

  function addFiles(incomingFiles: File[]) {
    const acceptedFiles = incomingFiles.filter((file) =>
      mode === 'image' ? file.type.startsWith('image/') : file.type.startsWith('video/'),
    )

    if (acceptedFiles.length === 0) {
      setNotice(`Choose ${mode === 'image' ? 'image' : 'video'} files for the active converter.`)
      return
    }

    const room = maxFiles - filesRef.current.length
    if (room <= 0) {
      setNotice(`The ${mode} converter accepts up to ${maxFiles} files at once.`)
      return
    }

    const nextFiles = acceptedFiles.slice(0, room).map<MediaFile>((file) => ({
      id: makeId(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'ready',
    }))

    setFiles((current) => [...current, ...nextFiles])
    resetOutput()
    setNotice(acceptedFiles.length > room ? `Added ${room} files. The rest were skipped.` : null)
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  function removeFile(id: string) {
    const target = filesRef.current.find((item) => item.id === id)
    if (target) URL.revokeObjectURL(target.previewUrl)
    setFiles((current) => current.filter((item) => item.id !== id))
    resetOutput()
  }

  function handleWatermarkLogoInput(event: ChangeEvent<HTMLInputElement>) {
    const [file] = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice('Choose an image file for the watermark logo.')
      return
    }

    if (watermarkLogoRef.current) URL.revokeObjectURL(watermarkLogoRef.current.previewUrl)

    const nextLogo = {
      file,
      previewUrl: URL.createObjectURL(file),
    }

    watermarkLogoRef.current = nextLogo
    setWatermarkLogo(nextLogo)
    updateSetting('watermarkMode', 'image')
    updateSetting('watermarkEnabled', true)
  }

  function removeWatermarkLogo() {
    if (watermarkLogoRef.current) URL.revokeObjectURL(watermarkLogoRef.current.previewUrl)
    watermarkLogoRef.current = null
    setWatermarkLogo(null)
  }

  async function convertAll() {
    if (!canConvert) return

    resetOutput()
    setIsWorking(true)
    setNotice(null)
    setFfmpegMessage('')
    setFiles((current) => current.map((item) => ({ ...item, status: 'ready', error: undefined })))
    setProgress({ label: 'Starting', current: 0, total: filesRef.current.length, percent: 0 })

    const converted: ConversionResult[] = []
    const selectedFiles = [...filesRef.current]

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const item = selectedFiles[index]
      setFiles((current) =>
        current.map((fileItem) => (fileItem.id === item.id ? { ...fileItem, status: 'working' } : fileItem)),
      )

      try {
        const result =
          mode === 'image'
            ? await convertImage(item)
            : await convertVideo(item, index, selectedFiles.length)
        converted.push(result)
        setFiles((current) =>
          current.map((fileItem) => (fileItem.id === item.id ? { ...fileItem, status: 'done' } : fileItem)),
        )
      } catch (error) {
        const message = getErrorMessage(error)
        setFiles((current) =>
          current.map((fileItem) =>
            fileItem.id === item.id ? { ...fileItem, status: 'failed', error: message } : fileItem,
          ),
        )
      }

      const complete = index + 1
      setProgress({
        label: complete === selectedFiles.length ? 'Complete' : 'Converting',
        current: complete,
        total: selectedFiles.length,
        percent: Math.round((complete / selectedFiles.length) * 100),
      })
    }

    setResults(converted)
    setIsWorking(false)
    setNotice(converted.length === 0 ? 'No files were converted. Check the file list for errors.' : null)
  }

  async function convertImage(item: MediaFile): Promise<ConversionResult> {
    const startedAt = getCurrentTime()
    const image = await loadImage(item.file)
    const size = calculateImageSize(
      image.naturalWidth,
      image.naturalHeight,
      parsePositiveNumber(settings.maxWidth),
      parsePositiveNumber(settings.maxHeight),
      settings.keepAspect,
    )

    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas rendering is not available in this browser.')

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'

    if (imageFormat.mime === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }

    context.drawImage(image, 0, 0, size.width, size.height)
    await applyImageWatermark(context, canvas.width, canvas.height, settings, watermarkLogo?.file ?? null)

    const blob = await canvasToBlob(
      canvas,
      imageFormat.mime,
      imageFormat.quality ? settings.quality : undefined,
    )

    if (!blob || (blob.type && blob.type !== imageFormat.mime && imageFormat.value !== 'png')) {
      throw new Error(`${imageFormat.label} output is not supported by this browser.`)
    }

    const outputName = buildOutputName(settings.filePrefix, item.file.name, imageFormat.extension)
    return {
      id: makeId(),
      sourceName: item.file.name,
      outputName,
      originalSize: item.file.size,
      convertedSize: blob.size,
      durationMs: getCurrentTime() - startedAt,
      blob,
      url: URL.createObjectURL(blob),
      previewType: 'image',
    }
  }

  async function ensureFfmpeg(): Promise<FfmpegTools> {
    if (ffmpegToolsRef.current?.ffmpeg.loaded) return ffmpegToolsRef.current
    if (ffmpegLoadRef.current) return ffmpegLoadRef.current

    ffmpegLoadRef.current = (async () => {
      setFfmpegMessage('Loading FFmpeg engine...')
      const [{ FFmpeg: FfmpegClass }, { fetchFile }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ])

      const ffmpeg = new FfmpegClass()
      ffmpeg.on('log', ({ message }) => {
        const trimmed = message.trim()
        if (!trimmed || trimmed === 'Aborted()') return

        ffmpegLogRef.current = [...ffmpegLogRef.current.slice(-79), trimmed]
        setFfmpegMessage(trimmed.slice(0, 220))
      })
      ffmpeg.on('progress', ({ progress: ffmpegProgress }) => {
        const context = progressContextRef.current
        if (!context) return
        const percent = ((context.index + Math.max(0, Math.min(1, ffmpegProgress))) / context.total) * 100
        setProgress({
          label: 'Encoding video',
          current: context.index,
          total: context.total,
          percent: Math.min(99, Math.round(percent)),
        })
      })

      await ffmpeg.load({
        coreURL: assetUrl('ffmpeg/ffmpeg-core.js'),
        wasmURL: assetUrl('ffmpeg/ffmpeg-core.wasm'),
      })

      const tools = { ffmpeg, fetchFile }
      ffmpegToolsRef.current = tools
      setFfmpegMessage('FFmpeg engine ready.')
      return tools
    })()

    try {
      return await ffmpegLoadRef.current
    } finally {
      ffmpegLoadRef.current = null
    }
  }

  async function convertVideo(item: MediaFile, index: number, total: number): Promise<ConversionResult> {
    const startedAt = getCurrentTime()
    const tools = await ensureFfmpeg()
    const inputName = `input_${item.id}.${getExtension(item.file.name) || 'media'}`
    const outputName = buildOutputName(settings.filePrefix, item.file.name, videoFormat.extension)
    const maxVideoWidth = parsePositiveNumber(settings.videoMaxWidth)
    let convertedBlob: Blob | null = null

    progressContextRef.current = { index, total }
    ffmpegLogRef.current = []

    try {
      await tools.ffmpeg.writeFile(inputName, await tools.fetchFile(item.file))

      try {
        await runFfmpeg(
          tools.ffmpeg,
          buildVideoArgs(inputName, outputName, videoFormat.value, settings.quality, maxVideoWidth, settings.stripAudio),
          ffmpegLogRef,
        )
      } catch (error) {
        if (settings.stripAudio || videoFormat.value === 'gif') {
          if (canUseBrowserVideoFallback(videoFormat.value)) {
            convertedBlob = await convertWithBrowserVideoFallback(
              item.file,
              videoFormat.value,
              settings.quality,
              maxVideoWidth,
              index,
              total,
            )
          } else {
            throw error
          }
        } else {
          try {
            setFfmpegMessage('Retrying without audio...')
            ffmpegLogRef.current = []
            await safeDelete(tools.ffmpeg, outputName)
            await runFfmpeg(
              tools.ffmpeg,
              buildVideoArgs(inputName, outputName, videoFormat.value, settings.quality, maxVideoWidth, true),
              ffmpegLogRef,
            )
          } catch (retryError) {
            if (!canUseBrowserVideoFallback(videoFormat.value)) throw retryError

            convertedBlob = await convertWithBrowserVideoFallback(
              item.file,
              videoFormat.value,
              settings.quality,
              maxVideoWidth,
              index,
              total,
            )
          }
        }
      }

      if (!convertedBlob) {
        const data = await tools.ffmpeg.readFile(outputName)
        const sourceBytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data)
        const binary = new Uint8Array(sourceBytes.length)
        binary.set(sourceBytes)
        convertedBlob = new Blob([binary.buffer], { type: videoFormat.mime })
      }

      return {
        id: makeId(),
        sourceName: item.file.name,
        outputName,
        originalSize: item.file.size,
        convertedSize: convertedBlob.size,
        durationMs: getCurrentTime() - startedAt,
        blob: convertedBlob,
        url: URL.createObjectURL(convertedBlob),
        previewType: videoFormat.value === 'gif' ? 'image' : 'video',
      }
    } finally {
      progressContextRef.current = null
      await safeDelete(tools.ffmpeg, inputName)
      await safeDelete(tools.ffmpeg, outputName)
    }
  }

  async function convertWithBrowserVideoFallback(
    file: File,
    format: VideoFormat,
    quality: number,
    maxWidth: number | null,
    index: number,
    total: number,
  ) {
    setFfmpegMessage(`Using browser ${format.toUpperCase()} encoder fallback. Audio will be removed.`)
    ffmpegToolsRef.current?.ffmpeg.terminate()
    ffmpegToolsRef.current = null

    return convertVideoWithMediaRecorder(file, format, quality, maxWidth, (percent) => {
      setProgress({
        label: `Encoding ${format.toUpperCase()}`,
        current: index,
        total,
        percent: Math.min(99, Math.round(((index + percent) / total) * 100)),
      })
    })
  }

  async function downloadAllAsZip() {
    if (!canDownloadAll) return

    const zip = new JSZip()
    results.forEach((result) => {
      zip.file(result.outputName, result.blob)
    })

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(zipBlob, mode === 'image' ? 'converted-images.zip' : 'converted-videos.zip')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <RefreshCw size={28} />
          </div>
          <div>
            <h1>Media Format Converter</h1>
            <p>Convert images and videos directly in your browser.</p>
          </div>
        </div>

        <button
          className="icon-button"
          type="button"
          title="Toggle theme"
          aria-label="Toggle theme"
          onClick={() => updateSetting('theme', settings.theme === 'dark' ? 'light' : 'dark')}
        >
          {settings.theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      <section className="mode-bar" aria-label="Converter mode">
        <button
          className={mode === 'image' ? 'mode-button active' : 'mode-button'}
          type="button"
          onClick={() => changeMode('image')}
          disabled={isWorking}
        >
          <ImageIcon size={18} />
          Images
        </button>
        <button
          className={mode === 'video' ? 'mode-button active' : 'mode-button'}
          type="button"
          onClick={() => changeMode('video')}
          disabled={isWorking}
        >
          <Video size={18} />
          Videos
        </button>
      </section>

      <section
        className={isDragging ? 'upload-panel drag-active' : 'upload-panel'}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setIsDragging(false)
        }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept={accept} multiple hidden onChange={handleFileInput} />
        <div className="upload-icon" aria-hidden="true">
          <Upload size={34} />
        </div>
        <h2>Drop {mode === 'image' ? 'images' : 'videos'} here</h2>
        <p>
          {mode === 'image'
            ? `PNG, JPG, WebP, AVIF, GIF, BMP and more. Up to ${MAX_IMAGE_FILES} files.`
            : `MP4, WebM, MOV, MKV and other common video files. Up to ${MAX_VIDEO_FILES} files.`}
        </p>
        <button className="primary-button" type="button">
          <Upload size={18} />
          Choose Files
        </button>
      </section>

      {notice ? (
        <div className="notice" role="status">
          {notice}
        </div>
      ) : null}

      {files.length > 0 ? (
        <section className="workspace-grid">
          <div className="tool-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Queue</span>
                <h2>{files.length} file{files.length === 1 ? '' : 's'} selected</h2>
              </div>
              <button
                className="icon-button quiet"
                type="button"
                title="Clear files"
                aria-label="Clear files"
                onClick={clearFiles}
                disabled={isWorking}
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="file-list">
              {files.map((item) => (
                <article className="file-row" key={item.id}>
                  {mode === 'image' ? (
                    <img src={item.previewUrl} alt="" className="file-preview" />
                  ) : (
                    <video src={item.previewUrl} className="file-preview" muted />
                  )}
                  <div className="file-meta">
                    <strong>{item.file.name}</strong>
                    <span>{formatBytes(item.file.size)}</span>
                    {item.error ? <small>{item.error}</small> : null}
                  </div>
                  <StatusIcon status={item.status} />
                  <button
                    className="icon-button quiet"
                    type="button"
                    title="Remove file"
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() => removeFile(item.id)}
                    disabled={isWorking}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          </div>

          <div className="tool-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Output</span>
                <h2>Conversion settings</h2>
              </div>
              <Settings2 size={22} />
            </div>

            <div className="controls-grid">
              <label className="field">
                <span>Format</span>
                <select
                  value={mode === 'image' ? settings.imageFormat : settings.videoFormat}
                  onChange={(event) =>
                    mode === 'image'
                      ? updateSetting('imageFormat', event.target.value as ImageFormat)
                      : updateSetting('videoFormat', event.target.value as VideoFormat)
                  }
                  disabled={isWorking}
                >
                  {(mode === 'image' ? IMAGE_FORMATS : VIDEO_FORMATS).map((format) => (
                    <option key={format.value} value={format.value}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Quality: {Math.round(settings.quality * 100)}%</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={settings.quality}
                  onChange={(event) => updateSetting('quality', Number(event.target.value))}
                  disabled={isWorking || (mode === 'image' && !imageFormat.quality)}
                />
              </label>

              <div className="preset-group" aria-label="Quality presets">
                {[0.9, 0.8, 0.6].map((value) => (
                  <button
                    key={value}
                    className={Math.abs(settings.quality - value) < 0.01 ? 'preset-button active' : 'preset-button'}
                    type="button"
                    onClick={() => updateSetting('quality', value)}
                    disabled={isWorking || (mode === 'image' && !imageFormat.quality)}
                  >
                    {value === 0.9 ? 'High' : value === 0.8 ? 'Balanced' : 'Small'} ({Math.round(value * 100)}%)
                  </button>
                ))}
              </div>

              {mode === 'image' ? (
                <>
                  <label className="field">
                    <span>Max width</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="Original"
                      value={settings.maxWidth}
                      onChange={(event) => updateSetting('maxWidth', event.target.value)}
                      disabled={isWorking}
                    />
                  </label>
                  <label className="field">
                    <span>Max height</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="Original"
                      value={settings.maxHeight}
                      onChange={(event) => updateSetting('maxHeight', event.target.value)}
                      disabled={isWorking}
                    />
                  </label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={settings.keepAspect}
                      onChange={(event) => updateSetting('keepAspect', event.target.checked)}
                      disabled={isWorking}
                    />
                    Maintain aspect ratio
                  </label>
                  <div className="watermark-controls">
                    <div className="watermark-heading">
                      {settings.watermarkMode === 'text' ? <Type size={20} /> : <ImagePlus size={20} />}
                      <div>
                        <span className="eyebrow">Watermark</span>
                        <h3>Image watermark</h3>
                      </div>
                    </div>

                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={settings.watermarkEnabled}
                        onChange={(event) => updateSetting('watermarkEnabled', event.target.checked)}
                        disabled={isWorking}
                      />
                      Add watermark to converted images
                    </label>

                    <div className="watermark-grid">
                      <label className="field">
                        <span>Watermark type</span>
                        <select
                          value={settings.watermarkMode}
                          onChange={(event) => updateSetting('watermarkMode', event.target.value as WatermarkMode)}
                          disabled={isWorking || !settings.watermarkEnabled}
                        >
                          <option value="text">Text</option>
                          <option value="image">Logo / image</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>Position</span>
                        <select
                          value={settings.watermarkPosition}
                          onChange={(event) =>
                            updateSetting('watermarkPosition', event.target.value as WatermarkPosition)
                          }
                          disabled={isWorking || !settings.watermarkEnabled}
                        >
                          {WATERMARK_POSITIONS.map((position) => (
                            <option key={position.value} value={position.value}>
                              {position.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {settings.watermarkMode === 'text' ? (
                        <>
                          <label className="field wide">
                            <span>Watermark text</span>
                            <input
                              type="text"
                              value={settings.watermarkText}
                              onChange={(event) => updateSetting('watermarkText', event.target.value)}
                              disabled={isWorking || !settings.watermarkEnabled}
                            />
                          </label>

                          <label className="field">
                            <span>Font size (px)</span>
                            <input
                              type="number"
                              min="8"
                              max="500"
                              value={settings.watermarkFontSize}
                              onChange={(event) => updateSetting('watermarkFontSize', event.target.value)}
                              disabled={isWorking || !settings.watermarkEnabled}
                            />
                          </label>

                          <label className="field">
                            <span>Boldness</span>
                            <select
                              value={settings.watermarkWeight}
                              onChange={(event) => updateSetting('watermarkWeight', event.target.value)}
                              disabled={isWorking || !settings.watermarkEnabled}
                            >
                              <option value="300">Light</option>
                              <option value="400">Regular</option>
                              <option value="600">Semi bold</option>
                              <option value="700">Bold</option>
                              <option value="800">Extra bold</option>
                              <option value="900">Black</option>
                            </select>
                          </label>

                          <label className="field">
                            <span>Text color</span>
                            <input
                              className="color-input"
                              type="color"
                              value={settings.watermarkColor}
                              onChange={(event) => updateSetting('watermarkColor', event.target.value)}
                              disabled={isWorking || !settings.watermarkEnabled}
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="field">
                            <span>Logo size (px)</span>
                            <input
                              type="number"
                              min="24"
                              max="1200"
                              value={settings.watermarkLogoSize}
                              onChange={(event) => updateSetting('watermarkLogoSize', event.target.value)}
                              disabled={isWorking || !settings.watermarkEnabled}
                            />
                          </label>

                          <div className="logo-watermark-field">
                            <input
                              ref={watermarkLogoInputRef}
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={handleWatermarkLogoInput}
                            />
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => watermarkLogoInputRef.current?.click()}
                              disabled={isWorking || !settings.watermarkEnabled}
                            >
                              <ImagePlus size={17} />
                              Choose Logo
                            </button>
                            {watermarkLogo ? (
                              <>
                                <img className="logo-watermark-preview" src={watermarkLogo.previewUrl} alt="" />
                                <button
                                  className="icon-button quiet"
                                  type="button"
                                  title="Remove watermark logo"
                                  aria-label="Remove watermark logo"
                                  onClick={removeWatermarkLogo}
                                  disabled={isWorking}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <span>No logo selected</span>
                            )}
                          </div>
                        </>
                      )}

                      <label className="field">
                        <span>Overlay style</span>
                        <select
                          value={settings.watermarkBackdrop}
                          onChange={(event) => updateSetting('watermarkBackdrop', event.target.value as WatermarkBackdrop)}
                          disabled={isWorking || !settings.watermarkEnabled}
                        >
                          {WATERMARK_BACKDROPS.map((backdrop) => (
                            <option key={backdrop.value} value={backdrop.value}>
                              {backdrop.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Opacity: {Math.round(settings.watermarkOpacity * 100)}%</span>
                        <input
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          value={settings.watermarkOpacity}
                          onChange={(event) => updateSetting('watermarkOpacity', Number(event.target.value))}
                          disabled={isWorking || !settings.watermarkEnabled}
                        />
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Max video width</span>
                    <input
                      type="number"
                      min="120"
                      placeholder="Original"
                      value={settings.videoMaxWidth}
                      onChange={(event) => updateSetting('videoMaxWidth', event.target.value)}
                      disabled={isWorking}
                    />
                  </label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={settings.stripAudio}
                      onChange={(event) => updateSetting('stripAudio', event.target.checked)}
                      disabled={isWorking || videoFormat.value === 'gif'}
                    />
                    Remove audio
                  </label>
                </>
              )}

              <label className="field wide">
                <span>File prefix</span>
                <input
                  type="text"
                  value={settings.filePrefix}
                  onChange={(event) => updateSetting('filePrefix', event.target.value)}
                  disabled={isWorking}
                />
              </label>
            </div>

            <div className="action-row">
              <button className="primary-button" type="button" onClick={convertAll} disabled={!canConvert}>
                {isWorking ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
                {isWorking ? 'Converting' : `Convert ${mode === 'image' ? 'Images' : 'Videos'}`}
              </button>
              <button className="secondary-button" type="button" onClick={downloadAllAsZip} disabled={!canDownloadAll}>
                <FileArchive size={18} />
                Download ZIP
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isWorking || progress.total > 0 ? (
        <section className="progress-panel" aria-live="polite">
          <div className="progress-text">
            <span>{progress.label}</span>
            <span>
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          {mode === 'video' && ffmpegMessage ? <p className="ffmpeg-log">{ffmpegMessage}</p> : null}
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="results-panel">
          <div className="results-heading">
            <div>
              <span className="eyebrow">Results</span>
              <h2>Conversion results</h2>
            </div>
            <div className="summary-pill">
              {formatBytes(summary.original)} -&gt; {formatBytes(summary.converted)}
              <strong>{formatSaving(summary.saved)}</strong>
              <span className="summary-time">Time: {formatDuration(summary.durationMs)}</span>
            </div>
          </div>

          <div className="results-grid">
            {results.map((result) => (
              <article className="result-card" key={result.id}>
                {result.previewType === 'image' ? (
                  <img src={result.url} alt="" className="result-preview" />
                ) : (
                  <video src={result.url} className="result-preview" controls />
                )}
                <div className="result-info">
                  <strong>{result.outputName}</strong>
                  <span>{result.sourceName}</span>
                </div>
                <div className="result-stats">
                  <span>{formatBytes(result.originalSize)}</span>
                  <span>{formatBytes(result.convertedSize)}</span>
                  <strong>{formatSaving(((result.originalSize - result.convertedSize) / result.originalSize) * 100)}</strong>
                </div>
                <div className="result-time">
                  <span>Converted in</span>
                  <strong>{formatDuration(result.durationMs)}</strong>
                </div>
                <button className="download-button" type="button" onClick={() => downloadBlob(result.blob, result.outputName)}>
                  <Download size={17} />
                  Download
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="footer">
        <Archive size={16} />
        <span>Client-side conversion. Files stay on this device.</span>
      </footer>

      <div className="developer-badge" aria-label="Developed by Khawaja Abdul Rehman">
        <img src={assetUrl('khawaja-abdul-rehman.png')} alt="Khawaja Abdul Rehman" />
        <div>
          <span>Developed by</span>
          <strong>Khawaja Abdul Rehman</strong>
        </div>
      </div>
    </main>
  )
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === 'working') return <Loader2 className="status-icon spin" size={19} aria-label="Working" />
  if (status === 'done') return <CheckCircle2 className="status-icon success" size={19} aria-label="Done" />
  if (status === 'failed') return <XCircle className="status-icon error" size={19} aria-label="Failed" />
  return <span className="status-dot" aria-label="Ready" />
}

function loadSettings(): ConverterSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (!saved) return DEFAULT_SETTINGS
    const parsed = JSON.parse(saved) as Partial<ConverterSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : DEFAULT_SETTINGS.theme,
      imageFormat: isImageFormat(parsed.imageFormat) ? parsed.imageFormat : DEFAULT_SETTINGS.imageFormat,
      videoFormat: isVideoFormat(parsed.videoFormat) ? parsed.videoFormat : DEFAULT_SETTINGS.videoFormat,
      quality: clamp(Number(parsed.quality ?? DEFAULT_SETTINGS.quality), 0.1, 1),
      watermarkEnabled: Boolean(parsed.watermarkEnabled ?? DEFAULT_SETTINGS.watermarkEnabled),
      watermarkMode: parsed.watermarkMode === 'image' ? 'image' : DEFAULT_SETTINGS.watermarkMode,
      watermarkPosition: isWatermarkPosition(parsed.watermarkPosition)
        ? parsed.watermarkPosition
        : DEFAULT_SETTINGS.watermarkPosition,
      watermarkBackdrop: isWatermarkBackdrop(parsed.watermarkBackdrop)
        ? parsed.watermarkBackdrop
        : DEFAULT_SETTINGS.watermarkBackdrop,
      watermarkOpacity: clamp(Number(parsed.watermarkOpacity ?? DEFAULT_SETTINGS.watermarkOpacity), 0.1, 1),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function isImageFormat(value: unknown): value is ImageFormat {
  return IMAGE_FORMATS.some((format) => format.value === value)
}

function isVideoFormat(value: unknown): value is VideoFormat {
  return VIDEO_FORMATS.some((format) => format.value === value)
}

function isWatermarkPosition(value: unknown): value is WatermarkPosition {
  return WATERMARK_POSITIONS.some((position) => position.value === value)
}

function isWatermarkBackdrop(value: unknown): value is WatermarkBackdrop {
  return WATERMARK_BACKDROPS.some((backdrop) => backdrop.value === value)
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The image could not be decoded.'))
    }
    image.src = url
  })
}

function calculateImageSize(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number | null,
  maxHeight: number | null,
  keepAspect: boolean,
) {
  if (!maxWidth && !maxHeight) return { width: originalWidth, height: originalHeight }

  if (!keepAspect) {
    return {
      width: maxWidth ?? originalWidth,
      height: maxHeight ?? originalHeight,
    }
  }

  const widthScale = maxWidth ? maxWidth / originalWidth : 1
  const heightScale = maxHeight ? maxHeight / originalHeight : 1
  const scale = Math.min(1, widthScale, heightScale)

  return {
    width: Math.max(1, Math.round(originalWidth * scale)),
    height: Math.max(1, Math.round(originalHeight * scale)),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality)
  })
}

async function applyImageWatermark(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  settings: ConverterSettings,
  logoFile: File | null,
) {
  if (!settings.watermarkEnabled) return

  if (settings.watermarkMode === 'image') {
    if (!logoFile) return
    const logo = await loadImage(logoFile)
    drawImageWatermark(context, canvasWidth, canvasHeight, settings, logo)
    return
  }

  const text = settings.watermarkText.trim()
  if (!text) return

  drawTextWatermark(context, canvasWidth, canvasHeight, settings, text)
}

function drawTextWatermark(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  settings: ConverterSettings,
  text: string,
) {
  const fontSize = clamp(parsePositiveNumber(settings.watermarkFontSize) ?? 48, 8, Math.max(canvasWidth, canvasHeight))
  const fontWeight = String(clamp(Number(settings.watermarkWeight), 300, 900))
  const padding = getWatermarkPadding(canvasWidth, canvasHeight)
  const innerPadding = Math.max(8, Math.round(fontSize * 0.34))
  const lineHeight = Math.round(fontSize * 1.2)

  context.save()
  context.font = `${fontWeight} ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`
  const metrics = context.measureText(text)
  const textWidth = Math.ceil(metrics.width)
  const textHeight = lineHeight
  const box = {
    width: textWidth + innerPadding * 2,
    height: textHeight + innerPadding * 2,
  }
  const point = calculateWatermarkPoint(canvasWidth, canvasHeight, box.width, box.height, settings.watermarkPosition, padding)

  drawWatermarkBackdrop(context, point.x, point.y, box.width, box.height, settings.watermarkBackdrop, fontSize)

  context.globalAlpha = clamp(settings.watermarkOpacity, 0.1, 1)
  context.fillStyle = settings.watermarkColor || '#ffffff'
  context.textBaseline = 'middle'
  context.textAlign = 'left'
  context.shadowColor = 'rgb(0 0 0 / 0.36)'
  context.shadowBlur = Math.max(2, Math.round(fontSize * 0.08))
  context.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.04))
  context.fillText(text, point.x + innerPadding, point.y + box.height / 2)
  context.restore()
}

function drawImageWatermark(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  settings: ConverterSettings,
  logo: HTMLImageElement,
) {
  const requestedSize = parsePositiveNumber(settings.watermarkLogoSize) ?? 160
  const maxSize = Math.max(24, Math.round(Math.min(canvasWidth, canvasHeight) * 0.65))
  const targetWidth = clamp(requestedSize, 24, maxSize)
  const targetHeight = Math.max(1, Math.round(targetWidth * (logo.naturalHeight / logo.naturalWidth)))
  const padding = getWatermarkPadding(canvasWidth, canvasHeight)
  const innerPadding = Math.max(8, Math.round(targetWidth * 0.12))
  const box = {
    width: targetWidth + innerPadding * 2,
    height: targetHeight + innerPadding * 2,
  }
  const point = calculateWatermarkPoint(canvasWidth, canvasHeight, box.width, box.height, settings.watermarkPosition, padding)

  context.save()
  drawWatermarkBackdrop(context, point.x, point.y, box.width, box.height, settings.watermarkBackdrop, targetWidth * 0.18)
  context.globalAlpha = clamp(settings.watermarkOpacity, 0.1, 1)
  context.drawImage(logo, point.x + innerPadding, point.y + innerPadding, targetWidth, targetHeight)
  context.restore()
}

function getWatermarkPadding(canvasWidth: number, canvasHeight: number) {
  return Math.max(16, Math.round(Math.min(canvasWidth, canvasHeight) * 0.04))
}

function calculateWatermarkPoint(
  canvasWidth: number,
  canvasHeight: number,
  boxWidth: number,
  boxHeight: number,
  position: WatermarkPosition,
  padding: number,
) {
  const horizontal = position.endsWith('left') ? 'left' : position.endsWith('right') ? 'right' : 'center'
  const vertical = position.startsWith('top') || position.endsWith('top')
    ? 'top'
    : position.startsWith('bottom') || position.endsWith('bottom')
      ? 'bottom'
      : 'center'

  const x =
    horizontal === 'left'
      ? padding
      : horizontal === 'right'
        ? canvasWidth - boxWidth - padding
        : (canvasWidth - boxWidth) / 2
  const y =
    vertical === 'top'
      ? padding
      : vertical === 'bottom'
        ? canvasHeight - boxHeight - padding
        : (canvasHeight - boxHeight) / 2

  return {
    x: Math.round(Math.max(padding, Math.min(canvasWidth - boxWidth - padding, x))),
    y: Math.round(Math.max(padding, Math.min(canvasHeight - boxHeight - padding, y))),
  }
}

function drawWatermarkBackdrop(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  backdrop: WatermarkBackdrop,
  radiusBase: number,
) {
  if (backdrop === 'none') return

  context.save()
  context.globalAlpha = 0.5
  context.fillStyle = backdrop === 'dark' ? '#000000' : '#ffffff'
  drawRoundRect(context, x, y, width, height, Math.max(8, Math.round(radiusBase * 0.28)))
  context.fill()
  context.restore()
}

function drawRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function buildVideoArgs(
  inputName: string,
  outputName: string,
  format: VideoFormat,
  quality: number,
  maxWidth: number | null,
  stripAudio: boolean,
) {
  const crf = String(Math.round(35 - quality * 17))
  const webmBitrate = quality >= 0.85 ? '2600k' : quality >= 0.7 ? '1700k' : '950k'
  const audioArgs = stripAudio ? ['-an'] : ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', '128k']
  const opusAudioArgs = stripAudio ? ['-an'] : ['-map', '0:a:0?', '-c:a', 'libopus', '-b:a', '96k']
  const scaleFilter = buildEvenScaleFilter(maxWidth)
  const videoMap = ['-map', '0:v:0']
  const filterArgs = ['-vf', scaleFilter]

  if (format === 'webm') {
    return [
      '-i',
      inputName,
      ...videoMap,
      ...opusAudioArgs,
      ...filterArgs,
      '-c:v',
      'libvpx',
      '-deadline',
      'realtime',
      '-cpu-used',
      '8',
      '-b:v',
      webmBitrate,
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      outputName,
    ]
  }

  if (format === 'mov') {
    return [
      '-i',
      inputName,
      ...videoMap,
      ...audioArgs,
      ...filterArgs,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      crf,
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      outputName,
    ]
  }

  if (format === 'gif') {
    const gifScale = buildEvenScaleFilter(maxWidth ?? 720)
    return [
      '-i',
      inputName,
      '-filter_complex',
      `${gifScale},fps=12,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop',
      '0',
      outputName,
    ]
  }

  return [
    '-i',
    inputName,
    ...videoMap,
    ...audioArgs,
    ...filterArgs,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    crf,
    '-pix_fmt',
    'yuv420p',
    '-shortest',
    '-movflags',
    'faststart',
    outputName,
  ]
}

function canUseBrowserVideoFallback(format: VideoFormat) {
  return format === 'webm' || format === 'mp4'
}

async function convertVideoWithMediaRecorder(
  file: File,
  format: VideoFormat,
  quality: number,
  maxWidth: number | null,
  onProgress: (percent: number) => void,
) {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This browser does not support the fallback video encoder.')
  }

  const mimeType = getRecorderMimeType(format)
  if (!mimeType) {
    throw new Error(`This browser cannot record ${format.toUpperCase()} output.`)
  }

  const sourceUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = sourceUrl
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  try {
    await waitForMediaEvent(video, 'loadedmetadata')

    const { width, height } = calculateVideoSize(video.videoWidth, video.videoHeight, maxWidth)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas rendering is not available in this browser.')

    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: quality >= 0.85 ? 2_600_000 : quality >= 0.7 ? 1_700_000 : 950_000,
    })

    const chunks: Blob[] = []
    let animationFrame = 0

    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => reject(new Error(`Browser ${format.toUpperCase()} encoding failed.`))
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
    })

    const draw = () => {
      context.drawImage(video, 0, 0, width, height)
      if (Number.isFinite(video.duration) && video.duration > 0) {
        onProgress(Math.min(0.99, video.currentTime / video.duration))
      }
      if (!video.ended && !video.paused) animationFrame = requestAnimationFrame(draw)
    }

    recorder.start(250)
    await video.play()
    draw()
    await waitForMediaEvent(video, 'ended')
    cancelAnimationFrame(animationFrame)
    if (recorder.state !== 'inactive') recorder.stop()

    const blob = await stopped
    if (blob.size === 0) throw new Error(`Browser ${format.toUpperCase()} encoder produced an empty file.`)
    return blob
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

function getRecorderMimeType(format: VideoFormat) {
  const candidates =
    format === 'mp4'
      ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4']
      : ['video/webm;codecs=vp8', 'video/webm']

  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ''
}

function waitForMediaEvent(element: HTMLMediaElement, eventName: 'loadedmetadata' | 'ended') {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener(eventName, handleEvent)
      element.removeEventListener('error', handleError)
    }
    const handleEvent = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('The video could not be decoded by the browser.'))
    }

    element.addEventListener(eventName, handleEvent, { once: true })
    element.addEventListener('error', handleError, { once: true })
  })
}

function calculateVideoSize(originalWidth: number, originalHeight: number, maxWidth: number | null) {
  const targetWidth = maxWidth ? Math.min(maxWidth, originalWidth) : originalWidth
  const evenWidth = Math.max(2, Math.floor(targetWidth / 2) * 2)
  const scaledHeight = Math.round((originalHeight / originalWidth) * evenWidth)
  const evenHeight = Math.max(2, Math.floor(scaledHeight / 2) * 2)

  return { width: evenWidth, height: evenHeight }
}

async function runFfmpeg(
  ffmpeg: FFmpeg,
  args: string[],
  logRef: MutableRefObject<string[]>,
) {
  try {
    const exitCode = await ffmpeg.exec(args)
    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}.`)
    }
  } catch (error) {
    throw new Error(buildFfmpegErrorMessage(error, logRef.current), { cause: error })
  }
}

function buildEvenScaleFilter(maxWidth: number | null) {
  if (!maxWidth) {
    return "scale=w='trunc(iw/2)*2':h='trunc(ih/2)*2',setsar=1"
  }

  const evenMaxWidth = Math.max(2, Math.floor(maxWidth / 2) * 2)
  return `scale=w='trunc(min(${evenMaxWidth},iw)/2)*2':h=-2,setsar=1`
}

function buildFfmpegErrorMessage(error: unknown, logs: string[]) {
  const baseMessage = getErrorMessage(error)
  const usefulLine = [...logs]
    .reverse()
    .find((line) =>
      /error|invalid|failed|unable|unknown|not found|not supported|cannot|could not|too large|abort/i.test(line),
    )
  const fallbackLine = logs.findLast((line) => !line.startsWith('frame=')) ?? logs.at(-1)
  const detail = usefulLine ?? fallbackLine

  if (!detail || baseMessage.includes(detail)) return baseMessage
  return `${baseMessage} ${detail}`.slice(0, 260)
}

async function safeDelete(ffmpeg: FFmpeg, path: string) {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    // Missing files are fine after a failed conversion.
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'Conversion failed.'
}

function buildOutputName(prefix: string, originalName: string, extension: string) {
  const baseName = originalName.replace(/\.[^/.]+$/, '')
  const safePrefix = sanitizeFilePart(prefix)
  const safeBase = sanitizeFilePart(baseName) || 'media'
  return `${safePrefix}${safeBase}.${extension}`
}

function sanitizeFilePart(value: string) {
  const safe = Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || /[<>:"/\\|?*]/.test(character) ? '_' : character
  }).join('')

  return safe.replace(/\s+/g, '_')
}

function getExtension(fileName: string) {
  const match = fileName.match(/\.([^.]+)$/)
  return match ? sanitizeFilePart(match[1].toLowerCase()) : ''
}

function assetUrl(path: string) {
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).toString()
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatSaving(value: number) {
  if (!Number.isFinite(value)) return '0% saved'
  if (value < 0) return `${Math.abs(value).toFixed(1)}% larger`
  return `${value.toFixed(1)}% saved`
}

function getCurrentTime() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '0 ms'
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))} ms`

  const seconds = milliseconds / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} sec`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes} min ${remainingSeconds} sec`
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default App
