/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Member, ChangeDeclaration, DisableDeclaration, MemberCalculationResult, ChiBoType } from '../types';

/**
 * Calculates the seniority of a member in years for a given month.
 * "Làm tròn đến năm. Ví dụ: hiện tại tháng 7/2026, vào ngành tháng 8/2020, thì thâm niên tính chỉ tính là 5 năm. Khi đến tháng 8/2026 thì mới tính thâm niên là 6 năm."
 */
export function calculateSeniority(joinDateStr: string, monthStr: string): number {
  if (!joinDateStr) return 0;
  
  const joinParts = joinDateStr.split('-');
  if (joinParts.length < 2) return 0;
  
  const joinYear = parseInt(joinParts[0], 10);
  const joinMonth = parseInt(joinParts[1], 10);
  
  const [currYear, currMonth] = monthStr.split('-').map(Number);
  
  let seniority = currYear - joinYear;
  if (currMonth < joinMonth) {
    seniority -= 1;
  }
  
  return Math.max(0, seniority);
}

/**
 * Resolves the state of a member for a given month by applying all historical changes
 * that are effective on or before the target month.
 */
export function resolveMemberState(
  member: Member,
  changes: ChangeDeclaration[],
  targetMonth: string
): { chiBo: ChiBoType; heSoLuong: number; heSoChucVu: number } {
  // Start with baseline values
  let chiBo = member.baseChiBo;
  let heSoLuong = member.baseHeSoLuong;
  let heSoChucVu = member.baseHeSoChucVu;

  // Filter and sort changes for this member that are effective on or before the target month
  const applicableChanges = changes
    .filter(c => c.memberId === member.id && c.effectiveMonth <= targetMonth)
    .sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth) || a.createdAt.localeCompare(b.createdAt));

  // Apply changes in chronological order
  for (const change of applicableChanges) {
    if (change.field === 'chiBo' && change.newChiBo) {
      chiBo = change.newChiBo;
    } else if (change.field === 'heSoLuong' && change.newHeSoLuong !== undefined) {
      heSoLuong = change.newHeSoLuong;
    } else if (change.field === 'heSoChucVu' && change.newHeSoChucVu !== undefined) {
      heSoChucVu = change.newHeSoChucVu;
    } else if (change.field === 'all') {
      if (change.newChiBo) chiBo = change.newChiBo;
      if (change.newHeSoLuong !== undefined) heSoLuong = change.newHeSoLuong;
      if (change.newHeSoChucVu !== undefined) heSoChucVu = change.newHeSoChucVu;
    }
  }

  return { chiBo, heSoLuong, heSoChucVu };
}

/**
 * Checks if a member is disabled for a given month.
 * Handles:
 * - "Vô hiệu hoá có thời hạn" (limited time): e.g. disabled from S for D months.
 * - "Vô hiệu hoá không thời hạn" (unlimited time): disabled from S onwards, until reactivated.
 */
export function checkDisableStatus(
  memberId: string,
  disables: DisableDeclaration[],
  targetMonth: string
): { isDisabled: boolean; type?: 'temporary' | 'permanent'; remainingMonths?: number } {
  // Find applicable disable declarations that started on or before the target month
  const applicableDisables = disables
    .filter(d => d.memberId === memberId && d.startMonth <= targetMonth)
    .sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.createdAt.localeCompare(b.createdAt));

  if (applicableDisables.length === 0) {
    return { isDisabled: false };
  }

  // The latest disable record determines the state
  const lastDisable = applicableDisables[applicableDisables.length - 1];

  // If reactivated on or before target month, they are active
  if (lastDisable.reactivatedMonth && lastDisable.reactivatedMonth <= targetMonth) {
    return { isDisabled: false };
  }

  if (lastDisable.type === 'permanent') {
    return { isDisabled: true, type: 'permanent' };
  }

  if (lastDisable.type === 'temporary' && lastDisable.durationMonths) {
    // Calculate months range
    const startStr = lastDisable.startMonth;
    const [startYear, startMonth] = startStr.split('-').map(Number);
    const [targetYear, targetMonthNum] = targetMonth.split('-').map(Number);
    
    const diffMonths = (targetYear - startYear) * 12 + (targetMonthNum - startMonth);
    
    if (diffMonths >= 0 && diffMonths < lastDisable.durationMonths) {
      const remaining = lastDisable.durationMonths - diffMonths;
      return { isDisabled: true, type: 'temporary', remainingMonths: remaining };
    }
  }

  return { isDisabled: false };
}

/**
 * Computes calculations for a single member in a target month.
 */
export function calculateMemberFee(
  member: Member,
  changes: ChangeDeclaration[],
  disables: DisableDeclaration[],
  baseSalary: number,
  targetMonth: string
): MemberCalculationResult {
  const { chiBo, heSoLuong, heSoChucVu } = resolveMemberState(member, changes, targetMonth);
  const { isDisabled, type, remainingMonths } = checkDisableStatus(member.id, disables, targetMonth);

  if (isDisabled) {
    return {
      memberId: member.id,
      name: member.name,
      joinDate: member.joinDate,
      chiBo,
      heSoLuong,
      heSoChucVu,
      baseSalary,
      tiengLuong: 0,
      seniorityYears: 0,
      tiengThamNien: 0,
      tongLuong: 0,
      dangPhi: 0,
      status: 'disabled',
      disableType: type,
      disableRemainingMonths: remainingMonths
    };
  }

  // Tiền lương = (Hệ số lương + Hệ số chức vụ) * Lương cơ bản
  const tiengLuong = (heSoLuong + heSoChucVu) * baseSalary;

  // Thâm niên
  const rawSeniority = calculateSeniority(member.joinDate, targetMonth);
  // Chỉ tính thâm niên đối với những người từ đủ 5 năm thâm niên. Dưới 5 năm thâm niên xem như bằng 0.
  const seniorityYears = rawSeniority >= 5 ? rawSeniority : 0;

  // Tiền thâm niên = Thâm niên (%) * Tiền lương
  const tiengThamNien = (seniorityYears / 100) * tiengLuong;

  // Tổng lương = Tiền lương + Tiền thâm niên
  const tongLuong = tiengLuong + tiengThamNien;

  // Đảng phí = 1% * Tổng lương
  const rawDangPhi = 0.01 * tongLuong;

  // Làm tròn lên hàng nghìn (ví dụ 114,234 -> 115,000)
  const dangPhi = Math.ceil(rawDangPhi / 1000) * 1000;

  return {
    memberId: member.id,
    name: member.name,
    joinDate: member.joinDate,
    chiBo,
    heSoLuong,
    heSoChucVu,
    baseSalary,
    tiengLuong,
    seniorityYears,
    tiengThamNien,
    tongLuong,
    dangPhi,
    status: 'active'
  };
}

/**
 * Returns an array of months (YYYY-MM) from startStr to endStr inclusive.
 */
export function getMonthRange(startStr: string, endStr: string): string[] {
  const range: string[] = [];
  let [startYear, startMonth] = startStr.split('-').map(Number);
  const [endYear, endMonth] = endStr.split('-').map(Number);

  while (startYear < endYear || (startYear === endYear && startMonth <= endMonth)) {
    range.push(`${startYear}-${String(startMonth).padStart(2, '0')}`);
    startMonth++;
    if (startMonth > 12) {
      startMonth = 1;
      startYear++;
    }
  }
  return range;
}

