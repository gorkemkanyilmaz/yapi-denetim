import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { Trash2 } from 'lucide-react'

const LABELS: Record<string, string> = {
  denetci_muhendis: 'Yapı Denetim Denetçi Mühendisi',
  santiye_sefi: 'Şantiye Şefi',
  beton_tesisi_yetkilisi: 'Hazır Beton Tesisi Yetkilisi',
}

export function SignaturePadComponent({ role, onChange, initial }: { role: string; onChange: (svg: string) => void; initial?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<SignaturePad | null>(null)
  const [name, setName] = useState('')
  const [tc, setTc] = useState('')

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext('2d')?.scale(ratio, ratio)
    const pad = new SignaturePad(canvas, { penColor: '#0f172a', minWidth: 1, maxWidth: 2.5 })
    padRef.current = pad
    if (initial) {
      const img = new Image()
      img.onload = () => pad.fromDataURL(initial)
      img.src = initial
    }
    return () => pad.off()
  }, [initial])

  function clear() {
    padRef.current?.clear()
    onChange('')
  }

  function commit() {
    const pad = padRef.current
    if (!pad || pad.isEmpty()) return
    const dataUrl = pad.toDataURL('image/svg+xml')
    onChange(dataUrl)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="text-sm font-semibold text-slate-900">{LABELS[role] ?? role}</div>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ad Soyad"
          className="rounded-md border-slate-300 text-sm p-2"
        />
        <input
          value={tc}
          onChange={(e) => setTc(e.target.value)}
          placeholder="T.C. Kimlik No"
          maxLength={11}
          className="rounded-md border-slate-300 text-sm p-2"
        />
      </div>
      <div className="relative border-2 border-dashed border-slate-300 rounded-md h-28 bg-slate-50">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" onMouseUp={commit} onTouchEnd={commit} />
      </div>
      <div className="flex justify-between items-center text-xs text-slate-500">
        <span>İmza alanı</span>
        <button onClick={clear} className="text-red-600 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Temizle</button>
      </div>
    </div>
  )
}
