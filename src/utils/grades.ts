export interface GradeInput {
  scoreOral: number | null;
  score15m: number | null;
  score1Period: number | null;
  scoreMidterm: number | null;
  scoreFinal: number | null;
}

export interface GradeResult {
  score: number | null;
  label: string;
}

export function calculateGradeAverage(grade: GradeInput | null | undefined): GradeResult {
  if (!grade) return { score: null, label: 'Chưa có điểm' };

  const { scoreOral, score15m, score1Period, scoreMidterm, scoreFinal } = grade;

  let totalPoints = 0;
  let totalWeights = 0;

  const clamp = (v: number) => Math.min(10, Math.max(0, v));

  if (scoreOral !== null && scoreOral !== undefined) { totalPoints += clamp(scoreOral) * 1; totalWeights += 1; }
  if (score15m !== null && score15m !== undefined) { totalPoints += clamp(score15m) * 1; totalWeights += 1; }
  if (score1Period !== null && score1Period !== undefined) { totalPoints += clamp(score1Period) * 2; totalWeights += 2; }
  if (scoreMidterm !== null && scoreMidterm !== undefined) { totalPoints += clamp(scoreMidterm) * 2; totalWeights += 2; }
  if (scoreFinal !== null && scoreFinal !== undefined) { totalPoints += clamp(scoreFinal) * 3; totalWeights += 3; }

  if (totalWeights === 0) return { score: null, label: 'Chưa nhập' };

  const avg = Math.round((totalPoints / totalWeights) * 10) / 10;

  let label = 'Yếu';
  if (avg >= 9.0) label = 'Xuất Sắc';
  else if (avg >= 8.0) label = 'Giỏi';
  else if (avg >= 6.5) label = 'Khá';
  else if (avg >= 5.0) label = 'Trung Bình';

  return { score: avg, label };
}

export function calculateAttendanceRate(
  presentCount: number,
  totalCount: number
): { rate: number; presentCount: number; totalCount: number } {
  if (totalCount === 0) return { rate: 100, presentCount: 0, totalCount: 0 };
  const rate = Math.round((presentCount / totalCount) * 100);
  return { rate, presentCount, totalCount };
}
