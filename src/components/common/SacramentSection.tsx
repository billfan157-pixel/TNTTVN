import React from 'react';
import type { Student } from '../../types';
import { getSacramentStatus, getAge } from '../../utils/sacraments';

interface SacramentSectionProps {
  student: Student;
}

export const SacramentSection: React.FC<SacramentSectionProps> = ({ student }) => {
  const status = getSacramentStatus(student);
  const age = getAge(student.dateOfBirth);

  const sacramentSteps = [
    { label: 'Rửa Tội', done: status.baptism.done, date: status.baptism.date, icon: '✝️' },
    { label: 'Rước Lễ Lần Đầu', done: status.firstCommunion.done, date: status.firstCommunion.date, icon: '🍞' },
    { label: 'Thêm Sức', done: status.confirmation.done, date: status.confirmation.date, icon: '🔥' },
  ];

  return (
    <div className="bg-surface-app rounded-xl p-4 border border-surface-border">
      <h4 className="text-sm font-extrabold text-parish-primary m-0 mb-3">Hành Trình Bí Tích</h4>
      <div className="flex flex-col gap-2">
        {sacramentSteps.map((step, idx) => (
          <div key={step.label} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${step.done ? 'bg-parish-success-bg' : 'bg-surface-hover'}`}>
              {step.done ? '✅' : '⏳'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-text-main">{step.label}</div>
              <div className="text-xs text-text-muted">
                {step.done ? step.date : 'Chưa lãnh nhận'}
              </div>
            </div>
            {idx < sacramentSteps.length - 1 && (
              <div className="w-px h-4 bg-surface-border ml-4" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-surface-border text-xs text-text-muted flex justify-between">
        <span>Tuổi: {age}</span>
        <span className="font-semibold text-parish-secondary">
          {status.nextSacrament}
        </span>
      </div>
    </div>
  );
};
