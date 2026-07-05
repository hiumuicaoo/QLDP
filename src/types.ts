/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ChiBoType = 'Khám nghiệm hiện trường' | 'Giám định' | 'Kỹ thuật phòng chống tội phạm';

export interface Member {
  id: string;
  name: string;
  joinDate: string; // YYYY-MM-DD
  baseMonth: string; // YYYY-MM (usually '2026-06')
  baseChiBo: ChiBoType;
  baseHeSoLuong: number;
  baseHeSoChucVu: number;
}

export interface ChangeDeclaration {
  id: string;
  memberId: string;
  memberName: string;
  field: 'chiBo' | 'heSoLuong' | 'heSoChucVu' | 'all';
  oldChiBo?: ChiBoType;
  newChiBo?: ChiBoType;
  oldHeSoLuong?: number;
  newHeSoLuong?: number;
  oldHeSoChucVu?: number;
  newHeSoChucVu?: number;
  effectiveMonth: string; // YYYY-MM
  createdAt: string;
}

export interface BaseSalaryHistory {
  id: string;
  amount: number;
  effectiveMonth: string; // YYYY-MM
  createdAt: string;
}

export interface DisableDeclaration {
  id: string;
  memberId: string;
  memberName: string;
  type: 'temporary' | 'permanent';
  startMonth: string; // YYYY-MM
  durationMonths?: number; // for temporary
  reactivatedMonth?: string; // YYYY-MM, if reactivated
  createdAt: string;
}

// Result of calculations for a member in a specific month
export interface MemberCalculationResult {
  memberId: string;
  name: string;
  joinDate: string;
  chiBo: ChiBoType;
  heSoLuong: number;
  heSoChucVu: number;
  baseSalary: number;
  tiengLuong: number; // Tiền lương = (Hệ số lương + Hệ số chức vụ) * Lương cơ bản
  seniorityYears: number; // Thâm niên (làm tròn năm, >= 5)
  tiengThamNien: number; // Tiền thâm niên = Thâm niên * 1% * Tiền lương
  tongLuong: number; // Tổng lương = Tiền lương + Tiền thâm niên
  dangPhi: number; // Đảng phí phải đóng = 1% * Tổng lương, làm tròn lên hàng nghìn
  status: 'active' | 'disabled';
  disableType?: 'temporary' | 'permanent';
  disableRemainingMonths?: number;
}

// Cumulative baseline configurations
export interface CumulativeBaselines {
  // Cấp đội (KTPCTP) - June 2026 baselines
  ktpctpH13: number; // 10,764,000
  ktpctpH20: number; // 4,524,400
  ktpctpH25: number; // 6,239,600

  // Toàn Đảng bộ - June 2026 baselines
  dangBoH13: number; // 26,100,800
  dangBoH20: number; // 18,893,200
  dangBoH21: number; // 18,270,560
  dangBoH25: number; // 7,830,240
}

export type ExpenditureType = 
  | 'D3_hoatdong' 
  | 'D3_thamom' 
  | 'D3_daihoidang' 
  | 'PC09_hoinghi' 
  | 'PC09_htxsnv' 
  | 'PC09_ketoan' 
  | 'PC09_thaymuc';

export interface Expenditure {
  id: string;
  type: ExpenditureType;
  category: 'D3' | 'PC09';
  date: string; // DD/MM/YYYY
  rawDate: string; // YYYY-MM-DD
  amount: number;
  amountInWords: string;
  coSoCanCu?: string;
  nguoiDeXuat?: string;
  nguoiThamHoi?: string;
  luongCoBan?: number;
  outputFilePath: string;
  outputFileName: string;
  createdAt: string;
}

