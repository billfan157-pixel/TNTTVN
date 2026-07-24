import React, { useState } from 'react'
import { Settings, Calculator, Save, RefreshCw, X, HelpCircle, Check } from 'lucide-react'
import {
  DEFAULT_GRADE_WEIGHTS,
  getStoredGradeWeights,
  saveStoredGradeWeights,
  calculateGradeAverage,
  type GradeWeightsConfig,
} from '../../utils/grades'

interface GradeFormulaConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSaveSuccess?: () => void
}

export const GradeFormulaConfigModal: React.FC<GradeFormulaConfigModalProps> = ({
  isOpen,
  onClose,
  onSaveSuccess,
}) => {
  const [config, setConfig] = useState<GradeWeightsConfig>(getStoredGradeWeights())
  const [testScore, setTestScore] = useState({
    scoreOral: 8.5,
    score15m: 9.0,
    score1Period: 8.0,
    scoreMidterm: 9.0,
    scoreFinal: 9.5,
  })
  const [savedSuccess, setSavedSuccess] = useState(false)

  if (!isOpen) return null

  const handleSave = () => {
    saveStoredGradeWeights(config)
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      if (onSaveSuccess) onSaveSuccess()
      onClose()
    }, 800)
  }

  const handleResetDefault = () => {
    setConfig(DEFAULT_GRADE_WEIGHTS)
  }

  // Calculated preview score with current formula
  const previewResult = calculateGradeAverage(testScore, config)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-parish-primary text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <Calculator className="w-6 h-6 text-[#FDE047]" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Cấu Hình Công Thức Tính Điểm & Hệ Số</h2>
              <p className="text-xs text-white/80">Tùy chỉnh hệ số cột điểm và xếp loại học lực Giáo lý</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Section 1: Column Weights */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4 text-parish-primary" />
              <span>1. Trọng Số Hệ Số Điểm Từng Cột</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 bg-surface-hover/30 border border-surface-border rounded-xl">
                <label className="block text-xs font-bold text-text-main mb-1">Điểm Miệng</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-muted font-bold">x</span>
                  <input
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={config.weightOral}
                    onChange={(e) => setConfig({ ...config, weightOral: parseFloat(e.target.value) || 1 })}
                    className="w-full text-sm font-extrabold text-parish-primary text-center bg-white border border-surface-border rounded-lg py-1 outline-hidden"
                  />
                </div>
              </div>

              <div className="p-3 bg-surface-hover/30 border border-surface-border rounded-xl">
                <label className="block text-xs font-bold text-text-main mb-1">Điểm 15 Phút</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-muted font-bold">x</span>
                  <input
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={config.weight15m}
                    onChange={(e) => setConfig({ ...config, weight15m: parseFloat(e.target.value) || 1 })}
                    className="w-full text-sm font-extrabold text-parish-primary text-center bg-white border border-surface-border rounded-lg py-1 outline-hidden"
                  />
                </div>
              </div>

              <div className="p-3 bg-surface-hover/30 border border-surface-border rounded-xl">
                <label className="block text-xs font-bold text-text-main mb-1">Điểm 1 Tiết</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-muted font-bold">x</span>
                  <input
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={config.weight1Period}
                    onChange={(e) => setConfig({ ...config, weight1Period: parseFloat(e.target.value) || 2 })}
                    className="w-full text-sm font-extrabold text-parish-primary text-center bg-white border border-surface-border rounded-lg py-1 outline-hidden"
                  />
                </div>
              </div>

              <div className="p-3 bg-surface-hover/30 border border-surface-border rounded-xl">
                <label className="block text-xs font-bold text-text-main mb-1">Điểm Giữa Kỳ</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-muted font-bold">x</span>
                  <input
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={config.weightMidterm}
                    onChange={(e) => setConfig({ ...config, weightMidterm: parseFloat(e.target.value) || 2 })}
                    className="w-full text-sm font-extrabold text-parish-primary text-center bg-white border border-surface-border rounded-lg py-1 outline-hidden"
                  />
                </div>
              </div>

              <div className="p-3 bg-surface-hover/30 border border-surface-border rounded-xl">
                <label className="block text-xs font-bold text-text-main mb-1">Điểm Cuối Kỳ</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-muted font-bold">x</span>
                  <input
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={config.weightFinal}
                    onChange={(e) => setConfig({ ...config, weightFinal: parseFloat(e.target.value) || 3 })}
                    className="w-full text-sm font-extrabold text-parish-primary text-center bg-white border border-surface-border rounded-lg py-1 outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Thresholds & Rounding */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
                2. Ngưỡng Xếp Loại Học Lực
              </h3>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <span className="text-xs font-bold text-amber-800">Xuất Sắc (≥)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="5"
                    max="10"
                    value={config.xuatSacThreshold}
                    onChange={(e) => setConfig({ ...config, xuatSacThreshold: parseFloat(e.target.value) || 9.0 })}
                    className="w-16 text-center text-xs font-extrabold text-amber-700 bg-white border border-amber-300 rounded-md py-0.5"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                  <span className="text-xs font-bold text-blue-800">Giỏi (≥)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="5"
                    max="10"
                    value={config.gioiThreshold}
                    onChange={(e) => setConfig({ ...config, gioiThreshold: parseFloat(e.target.value) || 8.0 })}
                    className="w-16 text-center text-xs font-extrabold text-blue-700 bg-white border border-blue-300 rounded-md py-0.5"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                  <span className="text-xs font-bold text-emerald-800">Khá (≥)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="5"
                    max="10"
                    value={config.khaThreshold}
                    onChange={(e) => setConfig({ ...config, khaThreshold: parseFloat(e.target.value) || 6.5 })}
                    className="w-16 text-center text-xs font-extrabold text-emerald-700 bg-white border border-emerald-300 rounded-md py-0.5"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-500/10 border border-slate-500/30 rounded-xl">
                  <span className="text-xs font-bold text-slate-800">Trung Bình (≥)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="3"
                    max="10"
                    value={config.trungBinhThreshold}
                    onChange={(e) => setConfig({ ...config, trungBinhThreshold: parseFloat(e.target.value) || 5.0 })}
                    className="w-16 text-center text-xs font-extrabold text-slate-700 bg-white border border-slate-300 rounded-md py-0.5"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
                3. Làm Tròn & Chế Độ Tính
              </h3>
              <div className="p-4 bg-surface-hover/30 border border-surface-border rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-bold text-text-main mb-1">Chữ Số Thập Phân Làm Tròn</label>
                  <select
                    value={config.roundingDecimal}
                    onChange={(e) => setConfig({ ...config, roundingDecimal: parseInt(e.target.value, 10) })}
                    className="w-full text-xs font-semibold bg-white border border-surface-border rounded-lg p-2"
                  >
                    <option value={1}>1 chữ số thập phân (Ví dụ: 8.5)</option>
                    <option value={2}>2 chữ số thập phân (Ví dụ: 8.55)</option>
                  </select>
                </div>

                <div className="pt-2 text-[11px] text-text-muted leading-relaxed flex items-start gap-1.5">
                  <HelpCircle className="w-4 h-4 text-parish-primary shrink-0 mt-0.5" />
                  <span>
                    Công thức áp dụng: <strong>ĐTB = Σ(Điểm x Hệ số) / ΣHệ số</strong>. Các cột để trống (chưa nhập) sẽ tự động bỏ qua hệ số tương ứng.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Live Simulator */}
          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-blue-600" />
              <span>Mô Phỏng Trực Tiếp Kết Quả Tính ĐTB</span>
            </h4>

            <div className="grid grid-cols-5 gap-2 text-center text-xs font-semibold">
              <div>
                <span className="text-[10px] text-text-muted block">Miệng</span>
                <input
                  type="number"
                  step="0.5"
                  value={testScore.scoreOral}
                  onChange={(e) => setTestScore({ ...testScore, scoreOral: parseFloat(e.target.value) || 0 })}
                  className="w-full text-center bg-white border border-surface-border rounded-md py-0.5"
                />
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">15P</span>
                <input
                  type="number"
                  step="0.5"
                  value={testScore.score15m}
                  onChange={(e) => setTestScore({ ...testScore, score15m: parseFloat(e.target.value) || 0 })}
                  className="w-full text-center bg-white border border-surface-border rounded-md py-0.5"
                />
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">1 Tiết</span>
                <input
                  type="number"
                  step="0.5"
                  value={testScore.score1Period}
                  onChange={(e) => setTestScore({ ...testScore, score1Period: parseFloat(e.target.value) || 0 })}
                  className="w-full text-center bg-white border border-surface-border rounded-md py-0.5"
                />
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">Giữa Kỳ</span>
                <input
                  type="number"
                  step="0.5"
                  value={testScore.scoreMidterm}
                  onChange={(e) => setTestScore({ ...testScore, scoreMidterm: parseFloat(e.target.value) || 0 })}
                  className="w-full text-center bg-white border border-surface-border rounded-md py-0.5"
                />
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">Cuối Kỳ</span>
                <input
                  type="number"
                  step="0.5"
                  value={testScore.scoreFinal}
                  onChange={(e) => setTestScore({ ...testScore, scoreFinal: parseFloat(e.target.value) || 0 })}
                  className="w-full text-center bg-white border border-surface-border rounded-md py-0.5"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-blue-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900">Kết quả ĐTB Mô Phỏng:</span>
              <div className="flex items-center gap-3">
                <span className="text-lg font-black text-emerald-600">{previewResult.score}</span>
                <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-800 text-xs font-extrabold rounded-full">
                  {previewResult.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-surface-hover/20 border-t border-surface-border flex items-center justify-between">
          <button
            onClick={handleResetDefault}
            className="px-3.5 py-2 bg-surface-hover hover:bg-surface-border text-text-main text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Mặc Định</span>
          </button>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-text-muted hover:text-text-main">
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-parish-primary hover:bg-parish-primary-hover text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
              <span>{savedSuccess ? 'Đã Lưu!' : 'Lưu Cấu Hình'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
