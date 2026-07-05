/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  UserX, 
  Edit, 
  FileSpreadsheet, 
  Settings, 
  ArrowRight, 
  TrendingUp, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  Upload, 
  RefreshCw,
  FolderOpen,
  Calendar,
  DollarSign,
  ShieldAlert,
  Percent,
  Camera,
  Trash2,
  BookOpen
} from 'lucide-react';
import { Member, ChangeDeclaration, DisableDeclaration, BaseSalaryHistory, ChiBoType, MemberCalculationResult, Expenditure, ExpenditureType } from './types';
import { calculateMemberFee, getMonthRange } from './utils/calculator';

// Supported units
const CHI_BO_OPTIONS: ChiBoType[] = [
  'Khám nghiệm hiện trường',
  'Giám định',
  'Kỹ thuật phòng chống tội phạm'
];

export default function App() {
  // Navigation & UI State
  const [activeTab, setActiveTab] = useState<'overview' | 'reports-team' | 'reports-dangbo' | 'history' | 'chi-dang-phi' | 'so-thu-chi'>('overview');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-06'); // Baseline month defaults to June 2026
  
  // Data State loaded from backend
  const [members, setMembers] = useState<Member[]>([]);
  const [changes, setChanges] = useState<ChangeDeclaration[]>([]);
  const [disables, setDisables] = useState<DisableDeclaration[]>([]);
  const [salaries, setSalaries] = useState<BaseSalaryHistory[]>([]);
  const [reportInputs, setReportInputs] = useState<Record<string, any>>({});
  const [calculations, setCalculations] = useState<MemberCalculationResult[]>([]);
  
  // Chi Đảng phí & Sổ Thu Chi state
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const [ktpctpLedger, setKtpctpLedger] = useState<any[]>([]);
  const [pc09Ledger, setPc09Ledger] = useState<any[]>([]);
  const [selectedChiType, setSelectedChiType] = useState<ExpenditureType>('D3_hoatdong');
  const [chiForm, setChiForm] = useState({
    date: (() => {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    })(),
    amount: 1000000,
    coSoCanCu: '',
    nguoiDeXuat: '',
    nguoiThamHoi: '',
    luongCoBan: 2340000
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [teamToCapture, setTeamToCapture] = useState<ChiBoType | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // Forms state
  const [showAddMember, setShowAddMember] = useState(false);
  const [joinDateInput, setJoinDateInput] = useState('01/01/2020');
  const [newMemberForm, setNewMemberForm] = useState({
    name: '',
    joinDate: '2020-01-01',
    baseMonth: '2026-06',
    baseChiBo: 'Khám nghiệm hiện trường' as ChiBoType,
    baseHeSoLuong: 4.4,
    baseHeSoChucVu: 0.0
  });

  const [showDisableMember, setShowDisableMember] = useState(false);
  const [disableForm, setDisableForm] = useState({
    memberId: '',
    type: 'temporary' as 'temporary' | 'permanent',
    startMonth: '2026-07',
    durationMonths: 3,
    note: ''
  });

  const [showDeclareChange, setShowDeclareChange] = useState(false);
  const [changeForm, setChangeForm] = useState({
    memberId: '',
    field: 'all' as 'chiBo' | 'heSoLuong' | 'heSoChucVu' | 'all',
    newChiBo: 'Khám nghiệm hiện trường' as ChiBoType,
    newHeSoLuong: 4.4,
    newHeSoChucVu: 0.0,
    effectiveMonth: '2026-07'
  });

  const [expSearchQuery, setExpSearchQuery] = useState('');
  const [showEditInitialBalances, setShowEditInitialBalances] = useState(false);
  const [initialBalancesForm, setInitialBalancesForm] = useState({
    ktpctp: 7050300,
    pc09: 22196910
  });
  const [selectedLedger, setSelectedLedger] = useState<'KTPCTP' | 'PC09'>('KTPCTP');
  const [selectedChiCategory, setSelectedChiCategory] = useState<'D3' | 'PC09'>('D3');

  const [showUpdateBaseSalary, setShowUpdateBaseSalary] = useState(false);
  const [salaryForm, setSalaryForm] = useState({
    amount: 2340000,
    effectiveMonth: '2026-07'
  });

  // Reporting parameters (local states for input forms)
  const [teamReportConfig, setTeamReportConfig] = useState({
    chiBo: 'Kỹ thuật phòng chống tội phạm' as ChiBoType,
    ratio: 70 // default 70% paid to upper level
  });

  const [dangBoReportConfig, setDangBoReportConfig] = useState({
    ratioUp: 30, // default 30% paid up to ĐUCAT
    a: 0, // KNHT collected from members
    b: 0, // KNHT paid to Party Committee
    c: 0, // GD collected
    d: 0, // GD paid
    e: 0, // KTPCTP collected
    f: 0  // KTPCTP paid
  });

  // Notifications of auto-reactivation
  const [reactivationAlerts, setReactivationAlerts] = useState<string[]>([]);

  // DB path info for local reassurance
  const [dbPathInfo, setDbPathInfo] = useState<string>('D:\\DANGPHI');

  // Load Data
  const loadData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error('Không thể kết nối đến máy chủ');
      const data = await res.json();
      setMembers(data.members || []);
      setChanges(data.changes || []);
      setDisables(data.disables || []);
      setSalaries(data.salaries || []);
      setReportInputs(data.reportInputs || {});
      
      // Also fetch calculations, expenditures and ledgers for current selected month
      await fetchCalculations(selectedMonth);
      await loadExpenditures();
      await fetchLedger(selectedMonth);
      await loadInitialBalances();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Lỗi tải dữ liệu. Hãy chắc chắn rằng máy chủ đang chạy.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadInitialBalances = async () => {
    try {
      const res = await fetch('/api/initial-balances');
      if (res.ok) {
        const data = await res.json();
        setInitialBalancesForm({
          ktpctp: data.ktpctp || 0,
          pc09: data.pc09 || 0
        });
      }
    } catch (err) {
      console.error('Error loading initial balances:', err);
    }
  };

  const handleSaveInitialBalances = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/initial-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initialBalancesForm)
      });
      if (res.ok) {
        setShowEditInitialBalances(false);
        await loadData();
      }
    } catch (err) {
      console.error('Error saving initial balances:', err);
    }
  };

  const fetchCalculations = async (month: string) => {
    try {
      const res = await fetch(`/api/calculations/${month}`);
      if (res.ok) {
        const data = await res.json();
        setCalculations(data.results || []);
      }
    } catch (err) {
      console.error('Error fetching calculations:', err);
    }
  };

  const loadExpenditures = async () => {
    try {
      const res = await fetch('/api/expenditures');
      if (res.ok) {
        const data = await res.json();
        setExpenditures(data.expenditures || []);
      }
    } catch (err) {
      console.error('Error loading expenditures:', err);
    }
  };

  const fetchLedger = async (month: string) => {
    try {
      const res = await fetch(`/api/so-thu-chi/${month}`);
      if (res.ok) {
        const data = await res.json();
        setKtpctpLedger(data.ktpctpLedger || []);
        setPc09Ledger(data.pc09Ledger || []);
      }
    } catch (err) {
      console.error('Error fetching ledger:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Recalculate and analyze when selectedMonth or disables list change
  useEffect(() => {
    if (!isLoading) {
      fetchCalculations(selectedMonth);
      fetchLedger(selectedMonth);
    }
  }, [selectedMonth, members, changes, disables, salaries, expenditures]);

  // Check for auto-reactivated members in the selected month
  useEffect(() => {
    if (disables.length === 0) return;
    const alerts: string[] = [];

    disables.forEach(d => {
      if (d.type === 'temporary' && d.durationMonths) {
        // Calculate when they should automatically reactivate
        const startStr = d.startMonth;
        const [startYear, startMonthNum] = startStr.split('-').map(Number);
        
        // Total months disabled = durationMonths
        // Reactivates on the month immediately after startMonth + durationMonths
        const totalMonths = startMonthNum - 1 + d.durationMonths;
        const endYear = startYear + Math.floor(totalMonths / 12);
        const endMonthNum = (totalMonths % 12) + 1;
        const reactivateMonthStr = `${endYear}-${String(endMonthNum).padStart(2, '0')}`;
        
        // If the selectedMonth matches or is after the reactivation month, but they are not reactivated in the DB yet,
        // we show that they have automatically reactivated starting from that reactivation month!
        if (selectedMonth >= reactivateMonthStr && (!d.reactivatedMonth || d.reactivatedMonth > reactivateMonthStr)) {
          alerts.push(`Đảng viên ${d.memberName} đã hết thời hạn vô hiệu hoá (${d.durationMonths} tháng từ ${d.startMonth}) và đã tự động hoạt động trở lại từ tháng ${reactivateMonthStr}!`);
        }
      }
    });

    setReactivationAlerts(alerts);
  }, [selectedMonth, disables]);

  // Set default form pre-fills when calculations change
  useEffect(() => {
    if (calculations.length > 0) {
      // Auto-prefill entire Party Committee report inputs with calculated values
      const knhtTotal = calculations.filter(r => r.chiBo === 'Khám nghiệm hiện trường' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
      const gdTotal = calculations.filter(r => r.chiBo === 'Giám định' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
      const ktpctpTotal = calculations.filter(r => r.chiBo === 'Kỹ thuật phòng chống tội phạm' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);

      // Default f is calculated based on KTPCTP's local ratio (let's say 70% or whatever is active in teamReportConfig)
      const currentKtpctpRatio = teamReportConfig.ratio;
      const defaultF = Math.round(ktpctpTotal * currentKtpctpRatio / 100);

      setDangBoReportConfig(prev => ({
        ...prev,
        a: knhtTotal,
        b: knhtTotal, // default Knht pays 100% of collected to Committee
        c: gdTotal,
        d: gdTotal,  // default Gd pays 100% of collected
        e: ktpctpTotal,
        f: defaultF  // Ktpctp pays ratio% of collected
      }));
    }
  }, [calculations, teamReportConfig.ratio]);

  // Handle Add Member
  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = joinDateInput.split('/');
    if (parts.length !== 3 || !parts[0] || !parts[1] || parts[2].length !== 4) {
      alert('Ngày vào ngành không đúng định dạng DD/MM/YYYY (ví dụ: 15/05/2018)');
      return;
    }
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    
    const dayNum = parseInt(d, 10);
    const monthNum = parseInt(m, 10);
    const yearNum = parseInt(y, 10);
    if (isNaN(dayNum) || isNaN(monthNum) || isNaN(yearNum) || dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100) {
      alert('Ngày, tháng hoặc năm vào ngành không hợp lệ!');
      return;
    }
    
    const convertedJoinDate = `${y}-${m}-${d}`;
    const payload = {
      ...newMemberForm,
      joinDate: convertedJoinDate
    };

    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowAddMember(false);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || 'Có lỗi xảy ra');
      }
    } catch (err) {
      alert('Không thể kết nối API');
    }
  };

  // Handle Delete Member
  const handleDeleteMember = async (memberId: string, name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn XOÁ HOÀN TOÀN Đảng viên "${name}" ra khỏi cơ sở dữ liệu? Việc này không thể phục hồi.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' });
      if (res.ok) {
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || 'Không thể xoá');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  // Handle Disable Member
  const handleDisableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disableForm.memberId) {
      alert('Vui lòng chọn Đảng viên');
      return;
    }
    try {
      const res = await fetch('/api/disables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(disableForm)
      });
      if (res.ok) {
        setShowDisableMember(false);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || 'Lỗi vô hiệu hoá');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  // Handle Reactivate Member manually
  const handleReactivate = async (memberId: string) => {
    try {
      const res = await fetch('/api/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          reactivatedMonth: selectedMonth
        })
      });
      if (res.ok) {
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || 'Lỗi kích hoạt lại');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  // Handle Capture Team list as a 4-column grid image
  const handleCaptureTeam = async (chiBoName: ChiBoType) => {
    setIsCapturing(true);
    setTeamToCapture(chiBoName);
    
    // Wait a brief timeout for React to mount and paint the off-screen element
    setTimeout(async () => {
      try {
        const node = document.getElementById('capture-container-target');
        if (!node) {
          alert('Không tìm thấy khung ảnh chụp!');
          setIsCapturing(false);
          setTeamToCapture(null);
          return;
        }
        
        const { toPng } = await import('html-to-image');
        
        // Get actual dimensions
        const width = 1280;
        const height = node.scrollHeight || node.offsetHeight || 1000;

        const dataUrl = await toPng(node, {
          backgroundColor: '#f8fafc',
          width: width,
          height: height,
          pixelRatio: 2, // 2 is perfect balance of crispness and size
          cacheBust: true,
          style: {
            transform: 'scale(1)',
            transformOrigin: 'top left',
          }
        });
        
        // Lưu ảnh vào clipboard trực tiếp không cần tải xuống
        try {
          const blobResponse = await fetch(dataUrl);
          const blob = await blobResponse.blob();
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob
            })
          ]);
          alert(`Đã chụp ảnh danh sách và lưu tự động vào bộ nhớ tạm (Clipboard) thành công!\nBây giờ bạn có thể nhấn Ctrl+V (hoặc dán) trực tiếp vào Zalo, Word, Messenger, v.v. để gửi hoặc lưu trữ.`);
        } catch (clipErr) {
          console.error('Không thể lưu ảnh vào clipboard:', clipErr);
          alert(`Không thể tự động sao chép vào bộ nhớ tạm (do chính sách bảo mật trình duyệt).\nChúng tôi sẽ tải xuống file ảnh thay thế.`);
          
          // Fallback to download if clipboard write fails
          const link = document.createElement('a');
          const cleanMonth = selectedMonth.replace('-', '_');
          const cleanTeamName = chiBoName === 'Khám nghiệm hiện trường' ? 'KhamNghiemHienTruong' :
                                chiBoName === 'Giám định' ? 'GiamDinh' : 'KyThuatPhongChongToiPham';
          link.download = `DangPhi_${cleanTeamName}_${cleanMonth}.png`;
          link.href = dataUrl;
          link.click();
        }
      } catch (err) {
        console.error('Lỗi khi chụp ảnh danh sách:', err);
        alert('Không thể chụp ảnh danh sách lúc này. Vui lòng thử lại.');
      } finally {
        setIsCapturing(false);
        setTeamToCapture(null);
      }
    }, 600); // 600ms allows layout, paint, and styles to settle fully
  };

  // Handle Declare Change (Khai báo thay đổi)
  const handleDeclareChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeForm.memberId) {
      alert('Vui lòng chọn Đảng viên');
      return;
    }
    try {
      const res = await fetch('/api/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changeForm)
      });
      if (res.ok) {
        setShowDeclareChange(false);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || 'Lỗi cập nhật');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  // Handle Update Base Salary (Cập nhật lương cơ bản)
  const handleSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/base-salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salaryForm)
      });
      if (res.ok) {
        setShowUpdateBaseSalary(false);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || 'Lỗi cập nhật');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  // Add Expenditure
  const handleAddExpenditureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/expenditures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedChiType,
          date: chiForm.date, // already in dd/mm/yyyy format
          amount: Number(chiForm.amount),
          coSoCanCu: chiForm.coSoCanCu,
          nguoiDeXuat: chiForm.nguoiDeXuat,
          nguoiThamHoi: chiForm.nguoiThamHoi,
          luongCoBan: Number(chiForm.luongCoBan)
        })
      });
      if (res.ok) {
        alert('Tạo đề xuất chi và sinh file phiếu chi Word thành công!');
        // reset form inputs while keeping defaults
        setChiForm(prev => ({
          ...prev,
          coSoCanCu: '',
          nguoiDeXuat: '',
          nguoiThamHoi: ''
        }));
        await loadExpenditures();
        await fetchLedger(selectedMonth);
      } else {
        const data = await res.json();
        alert(data.error || 'Có lỗi xảy ra khi tạo đề xuất chi');
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ khi tạo đề xuất chi');
    }
  };

  // Delete Expenditure
  const handleDeleteExpenditure = async (id: string, fileName: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xoá đề xuất chi này? Thao tác này cũng sẽ xoá tệp tin Word "${fileName}" đã sinh.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/expenditures/${id}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Đã xoá đề xuất chi thành công!');
        await loadExpenditures();
        await fetchLedger(selectedMonth);
      } else {
        const data = await res.json();
        alert(data.error || 'Có lỗi xảy ra khi xoá');
      }
    } catch (err) {
      alert('Lỗi kết nối khi xoá đề xuất chi');
    }
  };

  // Download Expenditure file
  const handleDownloadExpenditure = (id: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = `/api/expenditures/download/${id}`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Generate and Download Team Report Excel
  const handleExportTeamReport = async () => {
    try {
      // First save the current configuration
      await fetch('/api/save-monthly-report-inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          capDoiRatios: {
            [teamReportConfig.chiBo]: teamReportConfig.ratio
          }
        })
      });

      // Trigger the download api
      const response = await fetch('/api/report/cap-doi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          chiBo: teamReportConfig.chiBo,
          ratio: teamReportConfig.ratio
        })
      });

      if (!response.ok) throw new Error('Không thể tải tệp báo cáo');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      let teamCode = 'KTPCTP';
      if (teamReportConfig.chiBo === 'Khám nghiệm hiện trường') teamCode = 'KNHT';
      if (teamReportConfig.chiBo === 'Giám định') teamCode = 'GD';
      
      a.href = url;
      a.download = `BaoCao_${teamCode}_Thang${selectedMonth.split('-')[1]}-${selectedMonth.split('-')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      
      alert(`Báo cáo đã được tạo và lưu thành công trên máy tính tại thư mục: D:\\DANGPHI\\BaoCao_${teamCode}\\ và đã được tải xuống trình duyệt!`);
    } catch (err) {
      alert('Có lỗi khi xuất Excel: ' + err);
    }
  };

  // Generate and Download Party Committee Report Excel
  const handleExportDangBoReport = async () => {
    try {
      // Save inputs first
      await fetch('/api/save-monthly-report-inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          dangBoRatio: dangBoReportConfig.ratioUp,
          dangBoInputs: {
            a: dangBoReportConfig.a,
            b: dangBoReportConfig.b,
            c: dangBoReportConfig.c,
            d: dangBoReportConfig.d,
            e: dangBoReportConfig.e,
            f: dangBoReportConfig.f
          }
        })
      });

      // Trigger download
      const response = await fetch('/api/report/dang-bo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          ratioUp: dangBoReportConfig.ratioUp,
          a: dangBoReportConfig.a,
          b: dangBoReportConfig.b,
          c: dangBoReportConfig.c,
          d: dangBoReportConfig.d,
          e: dangBoReportConfig.e,
          f: dangBoReportConfig.f
        })
      });

      if (!response.ok) throw new Error('Không thể tải tệp báo cáo');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BaoCao_DangBo_Thang${selectedMonth.split('-')[1]}-${selectedMonth.split('-')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      alert('Báo cáo toàn Đảng bộ đã được tạo và lưu thành công tại thư mục: D:\\DANGPHI\\BaoCao_DangBo\\ và đã được tải xuống trình duyệt!');
    } catch (err) {
      alert('Có lỗi khi xuất Excel: ' + err);
    }
  };

  // Template Excel Upload helper
  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>, isDangBo: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Content = (reader.result as string).split(',')[1];
      const name = isDangBo ? 'Mau_BaoCao_ToanDangBo.xlsx' : 'Mau_BaoCao_CapDoi.xlsx';
      
      try {
        const res = await fetch('/api/upload-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, base64Content })
        });
        if (res.ok) {
          alert(`Đã tải lên và lưu cấu hình file mẫu "${name}" thành công!`);
        } else {
          alert('Không thể lưu file mẫu');
        }
      } catch (err) {
        alert('Lỗi kết nối tải lên');
      }
    };
    reader.readAsDataURL(file);
  };

  // Calculation summaries
  const getActiveBaseSalary = () => {
    const applicable = salaries
      .filter(s => s.effectiveMonth <= selectedMonth)
      .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.createdAt.localeCompare(a.createdAt));
    return applicable.length > 0 ? applicable[0].amount : 2340000;
  };

  const getChangesInMonth = () => {
    return changes.filter(c => c.effectiveMonth === selectedMonth);
  };

  const activeSalaryVal = getActiveBaseSalary();

  // Compute live team-level stats
  const getTeamStats = (chiBo: ChiBoType) => {
    const list = calculations.filter(r => r.chiBo === chiBo);
    const active = list.filter(r => r.status === 'active');
    const disabled = list.filter(r => r.status === 'disabled');
    const totalFees = active.reduce((sum, r) => sum + r.dangPhi, 0);
    return { list, active, disabled, totalFees };
  };

  // Compute Team Report live values for preview
  const getTeamReportPreview = () => {
    const { chiBo, ratio } = teamReportConfig;
    const stats = getTeamStats(chiBo);
    const totalCount = stats.active.length;
    const h12 = stats.totalFees;

    // Calculate H13 (cumulative H12)
    const [year, monthNum] = selectedMonth.split('-').map(Number);
    const is2026 = year === 2026;
    const startM = is2026 ? '2026-06' : `${year}-01`;
    const months = getMonthRange(startM, selectedMonth);

    let sumH12 = 0;
    let sumH16 = 0;
    let sumH24 = 0;

    months.forEach(m => {
      // In a real application, we retrieve the actual historical fees for month m
      // For preview, we approximate based on current active members or actual calculations
      // Let's calculate exactly based on members in that month
      // This matches our backend cumulative calculator!
      const monthCalcs = members
        .filter(mem => mem.baseMonth <= m)
        .map(mem => calculateMemberFee(mem, changes, disables, activeSalaryVal, m));
      
      const teamM = monthCalcs.filter(r => r.chiBo === chiBo && r.status === 'active');
      const h12_m = teamM.reduce((sum, r) => sum + r.dangPhi, 0);
      
      let ratio_m = ratio;
      if (m !== selectedMonth && reportInputs[m]?.capDoiRatios?.[chiBo] !== undefined) {
        ratio_m = reportInputs[m].capDoiRatios[chiBo];
      }

      sumH12 += h12_m;
      sumH16 += h12_m * (100 - ratio_m) / 100;
      sumH24 += h12_m * ratio_m / 100;
    });

    const h13_baseline = chiBo === 'Kỹ thuật phòng chống tội phạm' && is2026 ? 10764000 : 0;
    const h20_baseline = chiBo === 'Kỹ thuật phòng chống tội phạm' && is2026 ? 4524400 : 0;
    const h25_baseline = chiBo === 'Kỹ thuật phòng chống tội phạm' && is2026 ? 6239600 : 0;

    const h13 = h13_baseline + sumH12;
    const h16 = h12 * (100 - ratio) / 100;
    const h20 = h20_baseline + sumH16;
    const h24 = h12 * ratio / 100;
    const h25 = h25_baseline + sumH24;

    return {
      h10: totalCount,
      h12,
      h13,
      h16,
      h20,
      h24,
      h25
    };
  };

  // Compute Entire Unit Report live values for preview
  const getDangBoReportPreview = () => {
    const { ratioUp, a, b, c, d, e, f } = dangBoReportConfig;
    const h10 = calculations.filter(r => r.status === 'active').length;
    const h12 = Number(b) + Number(d) + Number(f);
    const h16 = Number(a) + Number(c) + Number(e);
    const h17 = h12 * (100 - ratioUp) / 100;
    const h24 = h12 * ratioUp / 100;

    // Cumulative calculations
    const [year] = selectedMonth.split('-').map(Number);
    const is2026 = year === 2026;
    const startM = is2026 ? '2026-06' : `${year}-01`;
    const months = getMonthRange(startM, selectedMonth);

    let sumH12 = 0;
    let sumH16 = 0;
    let sumH17 = 0;
    let sumH24 = 0;

    months.forEach(m => {
      let inp = { a, b, c, d, e, f };
      let rtUp = ratioUp;

      if (m !== selectedMonth) {
        const hist = reportInputs[m];
        if (hist && hist.dangBoInputs) {
          inp = hist.dangBoInputs;
        } else {
          // Default estimation
          const monthCalcs = members
            .filter(mem => mem.baseMonth <= m)
            .map(mem => calculateMemberFee(mem, changes, disables, activeSalaryVal, m));
          
          const knht = monthCalcs.filter(r => r.chiBo === 'Khám nghiệm hiện trường' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
          const gd = monthCalcs.filter(r => r.chiBo === 'Giám định' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
          const ktpctp = monthCalcs.filter(r => r.chiBo === 'Kỹ thuật phòng chống tội phạm' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
          
          let ktpctpRatio = teamReportConfig.ratio;
          if (reportInputs[m]?.capDoiRatios?.['Kỹ thuật phòng chống tội phạm'] !== undefined) {
            ktpctpRatio = reportInputs[m].capDoiRatios['Kỹ thuật phòng chống tội phạm'];
          }

          inp = {
            a: knht,
            b: knht,
            c: gd,
            d: gd,
            e: ktpctp,
            f: Math.round(ktpctp * ktpctpRatio / 100)
          };
        }

        if (hist && hist.dangBoRatio !== undefined) {
          rtUp = hist.dangBoRatio;
        }
      }

      const h12_m = Number(inp.b) + Number(inp.d) + Number(inp.f);
      const h16_m = Number(inp.a) + Number(inp.c) + Number(inp.e);
      const h17_m = h12_m * (100 - rtUp) / 100;
      const h24_m = h12_m * rtUp / 100;

      sumH12 += h12_m;
      sumH16 += h16_m;
      sumH17 += h17_m;
      sumH24 += h24_m;
    });

    const h13_baseline = is2026 ? 26100800 : 0;
    const h20_baseline = is2026 ? 18893200 : 0;
    const h21_baseline = is2026 ? 18270560 : 0;
    const h25_baseline = is2026 ? 7830240 : 0;

    const h13 = h13_baseline + sumH12;
    const h20 = h20_baseline + sumH16;
    const h21 = h21_baseline + sumH17;
    const h25 = h25_baseline + sumH24;

    return {
      h10,
      h12,
      h13,
      h16,
      h17,
      h20,
      h21,
      h24,
      h25
    };
  };

  const getChiBoColorClasses = (chiBo: ChiBoType) => {
    if (chiBo === 'Khám nghiệm hiện trường') return { border: 'border-l-4 border-blue-600', text: 'text-blue-700', bg: 'bg-blue-50' };
    if (chiBo === 'Giám định') return { border: 'border-l-4 border-emerald-600', text: 'text-emerald-700', bg: 'bg-emerald-50' };
    return { border: 'border-l-4 border-amber-600', text: 'text-amber-700', bg: 'bg-amber-50' };
  };

  const teamPreview = getTeamReportPreview();
  const dangBoPreview = getDangBoReportPreview();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased">
      {/* Upper Navigation Header */}
      <header className="bg-[#003366] text-white px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <div className="bg-red-600 w-10 h-10 flex items-center justify-center rounded shadow-inner text-white font-black text-xl">
            ★
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight uppercase text-white flex items-center gap-2">
              Hệ thống Quản lý Đảng phí <span className="text-xs bg-blue-900 text-blue-200 border border-blue-700 px-2 py-0.5 rounded font-mono font-bold">Phiên bản 1.0</span>
            </h1>
            <p className="text-xs text-blue-200 font-semibold uppercase tracking-wider">Đơn vị: Đội Kỹ thuật hình sự - Công an tỉnh</p>
          </div>
        </div>

        {/* Global Month & Base Salary Config */}
        <div className="flex flex-wrap items-center gap-6">
          <div className="text-right md:border-r md:border-blue-400 md:pr-6 flex items-center gap-2.5">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-blue-200 font-extrabold opacity-95">Tháng báo cáo</p>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent border-none text-white font-black text-xl font-sans focus:outline-none w-44 cursor-pointer leading-none text-right [color-scheme:dark]"
                  min="2026-06"
                />
                <Calendar className="w-4 h-4 text-yellow-400 shrink-0" />
              </div>
            </div>
          </div>

          <div className="text-right flex items-center gap-2.5">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-blue-200 font-extrabold opacity-95">Mức lương cơ bản</p>
              <p className="text-xl font-black leading-none text-yellow-400 flex items-center justify-end gap-1 font-mono mt-0.5">
                {activeSalaryVal.toLocaleString('vi-VN')} <span className="text-xs font-normal text-white">đ</span>
              </p>
            </div>
            <button 
              onClick={() => {
                setSalaryForm({ amount: activeSalaryVal, effectiveMonth: selectedMonth });
                setShowUpdateBaseSalary(true);
              }}
              className="bg-blue-800/80 hover:bg-blue-700 text-white p-1.5 rounded transition shadow-sm border border-blue-600"
              title="Cập nhật lương cơ bản"
              id="btn-update-salary"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
          </div>

          <button 
            onClick={loadData}
            className="bg-blue-800/80 hover:bg-blue-700 border border-blue-600 p-2 rounded text-white transition shadow-sm cursor-pointer"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col lg:flex-row gap-6">
        {/* Left Control Column (Rails / Settings & Triggers) */}
        <div className="w-full lg:w-64 flex flex-col gap-4 shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5 shadow-sm">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Chức năng</span>
            
            <button 
              onClick={() => setActiveTab('overview')}
              className={`w-full text-left px-4 py-3 rounded font-bold text-sm transition-colors cursor-pointer flex items-center justify-between ${activeTab === 'overview' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              id="tab-overview"
            >
              <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Bảng tính đảng phí</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${activeTab === 'overview' ? 'bg-blue-900 text-blue-200' : 'bg-slate-100 text-slate-500'}`}>{members.length}</span>
            </button>

            <button 
              onClick={() => setActiveTab('reports-team')}
              className={`w-full text-left px-4 py-3 rounded font-bold text-sm transition-colors cursor-pointer flex items-center gap-2 ${activeTab === 'reports-team' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              id="tab-reports-team"
            >
              <FileSpreadsheet className="w-4 h-4" /> Báo cáo cấp Đội
            </button>

            <button 
              onClick={() => setActiveTab('reports-dangbo')}
              className={`w-full text-left px-4 py-3 rounded font-bold text-sm transition-colors cursor-pointer flex items-center gap-2 ${activeTab === 'reports-dangbo' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              id="tab-reports-dangbo"
            >
              <TrendingUp className="w-4 h-4" /> Báo cáo toàn Đảng bộ
            </button>

            <button 
              onClick={() => setActiveTab('history')}
              className={`w-full text-left px-4 py-3 rounded font-bold text-sm transition-colors cursor-pointer flex items-center justify-between ${activeTab === 'history' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              id="tab-history"
            >
              <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> Khai báo & Lịch sử</span>
              {getChangesInMonth().length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-black ${activeTab === 'history' ? 'bg-red-700 text-white' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                  {getChangesInMonth().length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('chi-dang-phi')}
              className={`w-full text-left px-4 py-3 rounded font-bold text-sm transition-colors cursor-pointer flex items-center gap-2 ${activeTab === 'chi-dang-phi' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              id="tab-chi-dang-phi"
            >
              <DollarSign className="w-4 h-4" /> Chi Đảng phí (Phần B)
            </button>

            <button 
              onClick={() => setActiveTab('so-thu-chi')}
              className={`w-full text-left px-4 py-3 rounded font-bold text-sm transition-colors cursor-pointer flex items-center gap-2 ${activeTab === 'so-thu-chi' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              id="tab-so-thu-chi"
            >
              <FolderOpen className="w-4 h-4" /> Sổ Thu - Chi (Phần C)
            </button>
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#003366]">Thao tác nhanh</span>
            
            <button 
              onClick={() => {
                setNewMemberForm(prev => ({ ...prev, baseMonth: selectedMonth }));
                setJoinDateInput('01/01/2020');
                setShowAddMember(true);
              }}
              className="w-full flex items-center gap-2 justify-center px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold text-xs uppercase tracking-wide shadow-sm transition cursor-pointer"
              id="btn-add-member-trigger"
            >
              <UserPlus className="w-3.5 h-3.5" /> Thêm Đảng viên
            </button>

            <button 
              onClick={() => {
                setDisableForm(prev => ({ ...prev, startMonth: selectedMonth }));
                setShowDisableMember(true);
              }}
              className="w-full flex items-center gap-2 justify-center px-4 py-2.5 bg-orange-600 hover:bg-orange-750 text-white rounded font-bold text-xs uppercase tracking-wide shadow-sm transition cursor-pointer"
              id="btn-disable-member-trigger"
            >
              <UserMinus className="w-3.5 h-3.5" /> Vô hiệu hoá
            </button>

            <button 
              onClick={() => {
                setChangeForm(prev => ({ ...prev, effectiveMonth: selectedMonth }));
                setShowDeclareChange(true);
              }}
              className="w-full flex items-center gap-2 justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-750 text-white rounded font-bold text-xs uppercase tracking-wide shadow-sm transition cursor-pointer"
              id="btn-declare-change-trigger"
            >
              <Edit className="w-3.5 h-3.5" /> Khai báo thay đổi
            </button>
          </div>

          {/* Folder Config Reassurance (EXE packing goal) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2 text-xs text-slate-600 shadow-sm">
            <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5" /> Thư mục dữ liệu
            </span>
            <div className="bg-slate-50 border border-slate-200 p-2 rounded font-mono text-[10px] break-all select-all text-blue-800 font-bold">
              {dbPathInfo}
            </div>
            <p className="leading-relaxed text-[11px] text-slate-500 font-medium">
              Dữ liệu được lưu trữ tập trung. Khi đóng gói thành tệp .exe chạy nội bộ, cấu hình đường dẫn này trong tệp <code className="text-slate-900 font-bold">.env</code> để đồng bộ mọi tài liệu báo cáo.
            </p>
          </div>
        </div>

        {/* Right Dashboard Container */}
        <main className="flex-1 min-w-0">
          {/* Reactivation Alerts Alert Area */}
          {reactivationAlerts.length > 0 && (
            <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-800 text-sm font-bold uppercase tracking-tight">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Kích hoạt lại tự động hoàn tất</span>
              </div>
              <ul className="list-disc list-inside text-xs text-emerald-700 space-y-1 font-medium">
                {reactivationAlerts.map((alert, i) => (
                  <li key={i}>{alert}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Displaying loading / error */}
          {isLoading ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3 bg-white border border-slate-200 rounded-xl shadow-sm">
              <RefreshCw className="w-10 h-10 text-[#003366] animate-spin" />
              <p className="text-sm text-slate-600 font-bold uppercase tracking-wider">Đang tải và tính toán số liệu Đảng phí...</p>
            </div>
          ) : errorMsg ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-xl text-center flex flex-col items-center gap-3 shadow-sm">
              <AlertCircle className="w-12 h-12 text-rose-600" />
              <p className="font-bold text-sm uppercase tracking-wide">{errorMsg}</p>
              <button onClick={loadData} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold uppercase tracking-wider transition shadow-sm">
                Thử lại
              </button>
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW & MONTHLY党费 CALCULATOR */}
              {activeTab === 'overview' && (
                <div className="flex flex-col gap-6">
                  {/* Headline monthly change overview badge */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                    <div>
                      <h2 className="text-lg font-black text-slate-950 tracking-tight uppercase">Tính toán Đảng phí - Tháng {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}</h2>
                      <p className="text-xs text-slate-600 font-medium mt-1">
                        Hệ thống tự động đồng bộ thay đổi từ tháng mốc <strong className="text-slate-900">06/2026</strong>. Tổng số tiền phải thu toàn đơn vị: <strong className="text-blue-700 text-sm font-black">{calculations.filter(r => r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0).toLocaleString('vi-VN')} đ</strong>
                      </p>
                    </div>

                    {/* Month change logs badge display */}
                    {getChangesInMonth().length > 0 ? (
                      <div className="bg-amber-50 border border-amber-200 text-amber-850 px-3.5 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-medium shadow-sm">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <strong>{getChangesInMonth().length} thay đổi</strong> nhân sự / hệ số bắt đầu từ tháng này.
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider">
                        Không có thay đổi mới áp dụng từ tháng này
                      </span>
                    )}
                  </div>

                  {/* Bento Grid showing the 3 squads */}
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {CHI_BO_OPTIONS.map((chiBo) => {
                      const { active, disabled, totalFees } = getTeamStats(chiBo);
                      const colors = getChiBoColorClasses(chiBo);
                      return (
                        <div key={chiBo} className={`bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm ${colors.border}`}>
                          {/* Card Header */}
                          <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between gap-2">
                            <div>
                              <h3 className="font-black text-xs text-slate-400 uppercase tracking-tight truncate max-w-[180px]">{chiBo}</h3>
                              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                {active.length} hoạt động • {disabled.length} vô hiệu hoá
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] text-slate-400 block leading-none uppercase font-black">TỔNG THU</span>
                              <span className={`text-base font-black ${colors.text} font-mono block mt-1`}>
                                {totalFees.toLocaleString('vi-VN')} đ
                              </span>
                            </div>
                          </div>

                          {/* Members List Table inside Card */}
                          <div className="flex-1 p-3 overflow-y-auto max-h-[360px] custom-scrollbar space-y-2 bg-white">
                            {active.length === 0 && disabled.length === 0 ? (
                              <div className="text-center py-10 text-xs text-slate-400 italic">Chưa có Đảng viên nào</div>
                            ) : (
                              <>
                                {/* Active Members List */}
                                {active.map(m => {
                                  return (
                                    <div key={m.memberId} className="bg-slate-50 hover:bg-slate-100 border border-slate-150 rounded-lg p-3 flex flex-col gap-2 transition">
                                      <div className="flex items-start justify-between gap-1.5">
                                        <div>
                                          <h4 className="font-bold text-xs text-slate-900">{m.name}</h4>
                                          <p className="text-[10px] text-slate-500 font-semibold">Vào ngành: {m.joinDate.split('-').reverse().join('/')}</p>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-xs font-black text-blue-700 font-mono block">
                                            {m.dangPhi.toLocaleString('vi-VN')}đ
                                          </span>
                                        </div>
                                      </div>

                                      {/* Detailed calculation explanation */}
                                      <div className="bg-white rounded border border-slate-200 p-2 text-[10px] text-slate-600 grid grid-cols-2 gap-x-2 gap-y-1 font-mono">
                                        <div>HS Lương: <span className="text-slate-900 font-bold">{m.heSoLuong}</span></div>
                                        <div>HS Chức vụ: <span className="text-slate-900 font-bold">{m.heSoChucVu}</span></div>
                                        <div>Thâm niên: <span className="text-amber-700 font-bold">{m.seniorityYears} năm</span></div>
                                        <div>Tiền TN: <span className="text-slate-900 font-bold">{(m.tiengThamNien).toLocaleString('vi-VN')}</span></div>
                                        <div className="col-span-2 border-t border-slate-100 pt-1.5 mt-0.5 flex justify-between font-sans">
                                          <span className="text-slate-500 font-medium">Lương+TN: {m.tongLuong.toLocaleString('vi-VN')}</span>
                                          <span className="text-blue-700 font-bold">(1%)</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* Disabled Members List */}
                                {disabled.map(m => (
                                  <div key={m.memberId} className="bg-slate-50/50 border border-slate-200 text-slate-400 rounded-lg p-3 flex flex-col gap-1.5 opacity-70">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5">
                                        <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                                        <h4 className="font-bold text-xs line-through text-slate-500">{m.name}</h4>
                                      </div>
                                      <button 
                                        onClick={() => handleReactivate(m.memberId)}
                                        className="text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded cursor-pointer transition font-bold uppercase"
                                        id={`btn-reactivate-${m.memberId}`}
                                      >
                                        Kích hoạt
                                      </button>
                                    </div>
                                    <p className="text-[10px] font-medium font-mono text-slate-500">
                                      Trạng thái: Vô hiệu hoá {m.disableType === 'temporary' ? `tạm thời (Còn ${m.disableRemainingMonths || 0} th)` : 'không thời hạn'}
                                    </p>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>

                          {/* Capture screenshot footer button */}
                          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-bold uppercase">Đội: {chiBo}</span>
                            <button
                              onClick={() => handleCaptureTeam(chiBo)}
                              disabled={isCapturing}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003366] hover:bg-[#002244] disabled:bg-slate-400 text-white rounded font-bold text-xs uppercase tracking-wide transition cursor-pointer select-none"
                              title="Chụp ảnh danh sách"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              {isCapturing && teamToCapture === chiBo ? 'Đang chụp...' : 'Chụp ảnh danh sách'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: REPORTS FOR TEAM (BÁO CÁO CẤP ĐỘI) */}
              {activeTab === 'reports-team' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-6 shadow-sm">
                  <div>
                    <h2 className="text-lg font-black text-slate-950 tracking-tight uppercase">Tạo báo cáo thu, nộp Đảng phí hàng tháng (Cấp Đội)</h2>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      Báo cáo xuất ra tệp Excel dạng mẫu chính thức, lưu trữ trực tiếp vào thư mục chỉ định và tải về máy.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Params Config Form */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <Settings className="w-4 h-4 text-blue-700" /> Tham số báo cáo
                      </h3>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-slate-500">Chọn Đội / Chi bộ:</label>
                        <select 
                          value={teamReportConfig.chiBo} 
                          onChange={(e) => setTeamReportConfig(prev => ({ ...prev, chiBo: e.target.value as ChiBoType }))}
                          className="bg-white border border-slate-200 rounded px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-700 font-bold"
                        >
                          {CHI_BO_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-slate-500 flex items-center justify-between">
                          <span>Tỷ lệ nộp lên cấp trên (%):</span>
                          <span className="text-blue-700 font-black">{teamReportConfig.ratio}%</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={teamReportConfig.ratio} 
                            onChange={(e) => setTeamReportConfig(prev => ({ ...prev, ratio: Number(e.target.value) }))}
                            className="flex-1 accent-blue-700"
                          />
                          <input 
                            type="number" 
                            min="0" 
                            max="100" 
                            value={teamReportConfig.ratio} 
                            onChange={(e) => setTeamReportConfig(prev => ({ ...prev, ratio: Math.min(100, Math.max(0, Number(e.target.value))) }))}
                            className="bg-white border border-slate-200 rounded px-2 py-1 text-center text-xs font-black font-mono w-14 text-slate-900"
                          />
                        </div>
                      </div>

                      {/* Template manager */}
                      <div className="border-t border-slate-200 pt-4 flex flex-col gap-2">
                        <span className="text-[11px] font-black uppercase text-slate-500">Cấu hình mẫu báo cáo (Tùy chọn):</span>
                        <label className="border border-dashed border-slate-300 hover:border-blue-700 hover:bg-blue-50/20 rounded-lg p-3 text-center cursor-pointer transition flex flex-col items-center gap-1.5 bg-white">
                          <Upload className="w-5 h-5 text-slate-400" />
                          <span className="text-[11px] text-[#003366] font-bold uppercase tracking-wider">Tải lên tệp mẫu .xlsx</span>
                          <span className="text-[9px] text-slate-500 font-medium">Mặc định: Tự sinh nếu không có</span>
                          <input 
                            type="file" 
                            accept=".xlsx" 
                            onChange={(e) => handleTemplateUpload(e, false)} 
                            className="hidden" 
                          />
                        </label>
                      </div>

                      <button 
                        onClick={handleExportTeamReport}
                        className="w-full bg-[#003366] hover:bg-blue-900 text-white font-black text-xs py-3 rounded uppercase tracking-wider shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                        id="btn-export-team-report"
                      >
                        <Download className="w-4 h-4" /> Tạo & Xuất báo cáo Excel
                      </button>
                    </div>

                    {/* Report Cells Preview */}
                    <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-[#003366]" /> Bản xem trước dữ liệu ô Excel (Cấp Đội)
                      </h3>

                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        Các ô dữ liệu dưới đây sẽ được dán chính xác vào biểu mẫu báo cáo tháng <strong className="text-slate-900">{selectedMonth.split('-').reverse().join('/')}</strong> cho Chi bộ <strong className="text-slate-900">{teamReportConfig.chiBo}</strong>.
                      </p>

                      <div className="border border-slate-200 rounded overflow-hidden font-mono text-xs bg-white shadow-sm">
                        <div className="grid grid-cols-4 bg-slate-100 text-slate-500 p-3 border-b border-slate-200 font-black uppercase text-[10px] tracking-wider">
                          <div>Tọa độ Ô</div>
                          <div className="col-span-2">Định nghĩa nội dung</div>
                          <div className="text-right">Giá trị nạp</div>
                        </div>

                        <div className="divide-y divide-slate-100">
                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-black text-blue-700">H10</div>
                            <div className="col-span-2 text-slate-700 font-medium">Đếm số người thuộc Chi bộ</div>
                            <div className="text-right font-black text-slate-900">{teamPreview.h10}</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-black text-blue-700">H12</div>
                            <div className="col-span-2 text-slate-700 font-medium">Tổng Đảng phí phải đóng tháng này</div>
                            <div className="text-right font-black text-blue-700">{teamPreview.h12.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-black text-blue-700">H13</div>
                            <div className="col-span-2 text-slate-700 font-medium leading-relaxed">
                              Lũy kế H12 từ tháng 6/2026 (Mốc khởi đầu KTPCTP: 10,764,000 đ)
                              <span className="text-[10px] block text-slate-400 italic mt-0.5 font-sans">Học luỹ kế về 0 khi bắt đầu tháng 1/2027</span>
                            </div>
                            <div className="text-right font-black text-slate-900">{teamPreview.h13.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-black text-blue-700">H16</div>
                            <div className="col-span-2 text-slate-700 font-medium">Đảng phí trích lại Chi bộ ({100 - teamReportConfig.ratio}%)</div>
                            <div className="text-right font-black text-slate-800">{teamPreview.h16.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-black text-blue-700">H20</div>
                            <div className="col-span-2 text-slate-700 font-medium leading-relaxed">
                              Lũy kế tiền trích lại Chi bộ (Mốc KTPCTP: 4,524,400 đ)
                              <span className="text-[10px] block text-slate-400 italic mt-0.5 font-sans">Reset về 0 vào tháng 1/2027</span>
                            </div>
                            <div className="text-right font-black text-slate-900">{teamPreview.h20.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-black text-blue-700">H24</div>
                            <div className="col-span-2 text-slate-700 font-medium">Đảng phí nộp lên cấp trên ({teamReportConfig.ratio}%)</div>
                            <div className="text-right font-black text-slate-800">{teamPreview.h24.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-black text-blue-700">H25</div>
                            <div className="col-span-2 text-slate-700 font-medium leading-relaxed">
                              Lũy kế tiền nộp lên cấp trên (Mốc KTPCTP: 6,239,600 đ)
                              <span className="text-[10px] block text-slate-400 italic mt-0.5 font-sans">Reset về 0 vào tháng 1/2027</span>
                            </div>
                            <div className="text-right font-black text-slate-900">{teamPreview.h25.toLocaleString('vi-VN')} đ</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: REPORTS FOR ENTIRE UNIT (TOÀN ĐẢNG BỘ) */}
              {activeTab === 'reports-dangbo' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-6 shadow-sm">
                  <div>
                    <h2 className="text-lg font-black text-slate-950 tracking-tight uppercase">Tạo báo cáo thu, nộp Đảng phí hàng tháng (Toàn Đảng bộ)</h2>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      Cung cấp các con số thực tế thu nộp từ 3 chi bộ, phần mềm tự động phân tích và tạo tờ trình xuất Excel lưu trữ.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Params Inputs & Config */}
                    <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <Settings className="w-4 h-4 text-blue-700" /> Nhập số liệu thực tế
                      </h3>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-slate-500 flex justify-between">
                          <span>Tỷ lệ nộp lên ĐUCAT (%):</span>
                          <span className="text-blue-700 font-black">{dangBoReportConfig.ratioUp}%</span>
                        </label>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={dangBoReportConfig.ratioUp} 
                          onChange={(e) => setDangBoReportConfig(prev => ({ ...prev, ratioUp: Number(e.target.value) }))}
                          className="accent-blue-700 w-full"
                        />
                      </div>

                      {/* Squad Inputs */}
                      <div className="flex flex-col gap-3 pt-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Số liệu thu nộp từng Đội:</span>
                        
                        {/* KNHT */}
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col gap-3 shadow-sm">
                          <span className="text-[11px] font-bold text-slate-950 uppercase">1. Đội Khám nghiệm hiện trường</span>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-600">Thu từ ĐV (a):</span>
                              <input 
                                type="number" 
                                value={dangBoReportConfig.a} 
                                onChange={(e) => setDangBoReportConfig(prev => ({ ...prev, a: Number(e.target.value) }))}
                                className="bg-slate-50 border border-slate-250 px-2.5 py-1.5 rounded font-black font-mono text-slate-950 text-right text-sm"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-600">Nộp lên ĐB (b):</span>
                              <input 
                                type="number" 
                                value={dangBoReportConfig.b} 
                                onChange={(e) => setDangBoReportConfig(prev => ({ ...prev, b: Number(e.target.value) }))}
                                className="bg-slate-50 border border-slate-250 px-2.5 py-1.5 rounded font-black font-mono text-slate-950 text-right text-sm"
                              />
                            </div>
                          </div>
                        </div>

                        {/* GD */}
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col gap-3 shadow-sm">
                          <span className="text-[11px] font-bold text-slate-950 uppercase">2. Đội Giám định</span>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-600">Thu từ ĐV (c):</span>
                              <input 
                                type="number" 
                                value={dangBoReportConfig.c} 
                                onChange={(e) => setDangBoReportConfig(prev => ({ ...prev, c: Number(e.target.value) }))}
                                className="bg-slate-50 border border-slate-250 px-2.5 py-1.5 rounded font-black font-mono text-slate-950 text-right text-sm"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-600">Nộp lên ĐB (d):</span>
                              <input 
                                type="number" 
                                value={dangBoReportConfig.d} 
                                onChange={(e) => setDangBoReportConfig(prev => ({ ...prev, d: Number(e.target.value) }))}
                                className="bg-slate-50 border border-slate-250 px-2.5 py-1.5 rounded font-black font-mono text-slate-950 text-right text-sm"
                              />
                            </div>
                          </div>
                        </div>

                        {/* KTPCTP */}
                        <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col gap-3 shadow-sm">
                          <span className="text-[11px] font-bold text-slate-950 uppercase">3. Đội Kỹ thuật phòng chống tội phạm</span>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-600">Thu từ ĐV (e):</span>
                              <input 
                                type="number" 
                                value={dangBoReportConfig.e} 
                                onChange={(e) => setDangBoReportConfig(prev => ({ ...prev, e: Number(e.target.value) }))}
                                className="bg-slate-50 border border-slate-250 px-2.5 py-1.5 rounded font-black font-mono text-slate-950 text-right text-sm"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-600">Nộp lên ĐB (f):</span>
                              <input 
                                type="number" 
                                value={dangBoReportConfig.f} 
                                onChange={(e) => setDangBoReportConfig(prev => ({ ...prev, f: Number(e.target.value) }))}
                                className="bg-slate-50 border border-slate-250 px-2.5 py-1.5 rounded font-black font-mono text-slate-950 text-right text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Template Manager */}
                      <div className="border-t border-slate-200 pt-3 flex flex-col gap-2 text-xs">
                        <span className="text-[11px] font-black uppercase text-slate-500">Chọn tệp mẫu (Tùy chọn):</span>
                        <label className="border border-dashed border-slate-300 hover:border-blue-700 hover:bg-blue-50/20 rounded-lg p-3 text-center cursor-pointer transition flex items-center justify-center gap-2 bg-white">
                          <Upload className="w-4 h-4 text-slate-400" />
                          <span className="font-bold text-[#003366] uppercase tracking-wider text-[11px]">Mẫu Toàn Đảng bộ (.xlsx)</span>
                          <input 
                            type="file" 
                            accept=".xlsx" 
                            onChange={(e) => handleTemplateUpload(e, true)} 
                            className="hidden" 
                          />
                        </label>
                      </div>

                      <button 
                        onClick={handleExportDangBoReport}
                        className="w-full bg-[#003366] hover:bg-blue-900 text-white font-black text-xs py-3 rounded uppercase tracking-wider shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
                        id="btn-export-dangbo-report"
                      >
                        <Download className="w-4 h-4" /> Xuất báo cáo Đảng bộ
                      </button>
                    </div>

                    {/* Preview Box */}
                    <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-blue-700" /> Xem trước ô Excel (Toàn Đơn vị)
                      </h3>

                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        Các ô dữ liệu dưới đây sẽ được chép trực tiếp vào biểu mẫu báo cáo tổng hợp Đảng bộ của tháng <strong className="text-slate-900">{selectedMonth.split('-').reverse().join('/')}</strong>.
                      </p>

                      <div className="border border-slate-200 rounded overflow-hidden font-mono text-xs bg-white shadow-sm">
                        <div className="grid grid-cols-4 bg-slate-100 text-slate-500 p-3 border-b border-slate-200 font-black uppercase text-[10px] tracking-wider">
                          <div>Tọa độ Ô</div>
                          <div className="col-span-2">Định nghĩa nội dung</div>
                          <div className="text-right">Giá trị nạp</div>
                        </div>

                        <div className="divide-y divide-slate-100">
                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-bold text-blue-700">H10</div>
                            <div className="col-span-2 text-slate-700 font-medium">Tổng số Đảng viên cả đơn vị</div>
                            <div className="text-right font-black text-slate-950">{dangBoPreview.h10}</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-bold text-blue-700">H12</div>
                            <div className="col-span-2 text-slate-700 font-medium">Tổng số tiền nộp lên Đảng bộ (b+d+f)</div>
                            <div className="text-right font-bold text-blue-700">{dangBoPreview.h12.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-bold text-blue-700">H13</div>
                            <div className="col-span-2 text-slate-700 font-medium leading-relaxed">
                              Lũy kế H12 từ tháng 6/2026 (Mốc khởi đầu: 26,100,800 đ)
                              <span className="text-[10px] block text-slate-400 italic mt-0.5 font-sans">Reset về 0 khi sang tháng 1/2027</span>
                            </div>
                            <div className="text-right font-black text-slate-950">{dangBoPreview.h13.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-bold text-blue-700">H16</div>
                            <div className="col-span-2 text-slate-700 font-medium">Tổng số tiền thu từ Đảng viên (a+c+e)</div>
                            <div className="text-right font-bold text-blue-750">{dangBoPreview.h16.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-bold text-blue-700">H17</div>
                            <div className="col-span-2 text-slate-700 font-medium">Đảng phí giữ lại Đảng bộ ({100 - dangBoReportConfig.ratioUp}%)</div>
                            <div className="text-right font-black text-slate-800">{dangBoPreview.h17.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-bold text-blue-700">H20</div>
                            <div className="col-span-2 text-slate-700 font-medium leading-relaxed">
                              Lũy kế tiền thu từ đảng viên (Mốc khởi đầu: 18,893,200 đ)
                              <span className="text-[10px] block text-slate-400 italic mt-0.5 font-sans">Reset về 0 vào tháng 1/2027</span>
                            </div>
                            <div className="text-right font-black text-slate-950">{dangBoPreview.h20.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-bold text-blue-700">H21</div>
                            <div className="col-span-2 text-slate-700 font-medium leading-relaxed">
                              Lũy kế tiền giữ lại Đảng bộ (Mốc khởi đầu: 18,270,560 đ)
                              <span className="text-[10px] block text-slate-400 italic mt-0.5 font-sans">Reset về 0 vào tháng 1/2027</span>
                            </div>
                            <div className="text-right font-black text-slate-950">{dangBoPreview.h21.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-bold text-blue-700">H24</div>
                            <div className="col-span-2 text-slate-700 font-medium">Đảng phí nộp lên ĐUCAT ({dangBoReportConfig.ratioUp}%)</div>
                            <div className="text-right font-black text-slate-850">{dangBoPreview.h24.toLocaleString('vi-VN')} đ</div>
                          </div>

                          <div className="grid grid-cols-4 p-3 hover:bg-slate-50/50 items-center">
                            <div className="font-bold text-blue-700">H25</div>
                            <div className="col-span-2 text-slate-700 font-medium leading-relaxed">
                              Lũy kế tiền nộp lên ĐUCAT (Mốc khởi đầu: 7,830,240 đ)
                              <span className="text-[10px] block text-slate-400 italic mt-0.5 font-sans">Reset về 0 vào tháng 1/2027</span>
                            </div>
                            <div className="text-right font-black text-slate-950">{dangBoPreview.h25.toLocaleString('vi-VN')} đ</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DECLARATIONS & SYSTEM HISTORY */}
              {activeTab === 'history' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-6 shadow-sm">
                  <div>
                    <h2 className="text-lg font-black text-slate-950 tracking-tight uppercase">Khai báo thay đổi & Lịch sử đồng bộ hệ thống</h2>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      Toàn bộ các mốc thời gian tăng lương, chuyển chi bộ, thăng chức vụ đều được ghi nhận làm cơ sở tính toán chính xác nhất.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* List of historical changes */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <TrendingUp className="w-4 h-4 text-blue-700" /> Nhật ký thay đổi nhân sự
                      </h3>

                      <div className="divide-y divide-slate-200 overflow-y-auto max-h-[420px] pr-2 custom-scrollbar space-y-2">
                        {changes.length === 0 ? (
                          <p className="text-xs text-slate-400 py-10 text-center italic">Chưa có khai báo thay đổi nào được ghi nhận.</p>
                        ) : (
                          changes
                            .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.createdAt.localeCompare(a.createdAt))
                            .map(c => (
                              <div key={c.id} className="pt-3 pb-3 flex items-start justify-between gap-3 text-xs">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <strong className="text-slate-900 font-black text-sm">{c.memberName}</strong>
                                    <span className="text-[10px] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[#003366] font-bold">
                                      Từ {c.effectiveMonth.split('-').reverse().join('/')}
                                    </span>
                                  </div>
                                  <p className="text-slate-600 text-xs font-medium mt-1 leading-relaxed">
                                    {c.field === 'chiBo' && `Chuyển sinh hoạt chi bộ: Từ "${c.oldChiBo}" sang "${c.newChiBo}"`}
                                    {c.field === 'heSoLuong' && `Thay đổi hệ số lương: Từ ${c.oldHeSoLuong} lên ${c.newHeSoLuong}`}
                                    {c.field === 'heSoChucVu' && `Thay đổi hệ số chức vụ: Từ ${c.oldHeSoChucVu} lên ${c.newHeSoChucVu}`}
                                    {c.field === 'all' && `Thay đổi đồng thời thông tin: Chi bộ: ${c.newChiBo}, HS Lương: ${c.newHeSoLuong}, HS Chức vụ: ${c.newHeSoChucVu}`}
                                  </p>
                                </div>
                                <button 
                                  onClick={async () => {
                                    if (confirm('Bạn có muốn xoá khai báo thay đổi này? Tính toán các tháng sau sẽ tự động cập nhật lại.')) {
                                      const res = await fetch(`/api/changes/${c.id}`, { method: 'DELETE' });
                                      if (res.ok) loadData();
                                    }
                                  }}
                                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded transition cursor-pointer"
                                  title="Xoá khai báo"
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    {/* Base salaries history */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <DollarSign className="w-4 h-4 text-blue-700" /> Nhật ký biến động Lương cơ bản
                      </h3>

                      <div className="divide-y divide-slate-200 overflow-y-auto max-h-[420px] pr-2 custom-scrollbar">
                        {salaries
                          .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.createdAt.localeCompare(a.createdAt))
                          .map(s => (
                            <div key={s.id} className="pt-3 pb-3 flex items-center justify-between text-xs font-mono bg-white p-3 rounded-lg border border-slate-100 my-1.5 shadow-sm">
                              <div>
                                <span className="text-slate-900 font-black text-sm">{s.amount.toLocaleString('vi-VN')} VND</span>
                                <span className="text-[10px] block text-slate-400 mt-1 font-sans font-semibold">Khởi tạo: {new Date(s.createdAt).toLocaleDateString('vi-VN')}</span>
                              </div>
                              <div className="bg-blue-50 border border-blue-200 px-2 py-1 rounded text-blue-800 text-[10px] font-black uppercase">
                                Áp dụng từ: {s.effectiveMonth.split('-').reverse().join('/')}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: CHI ĐẢNG PHÍ (PHẦN B) */}
              {activeTab === 'chi-dang-phi' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-6 shadow-sm">
                  <div>
                    <h2 className="text-lg font-black text-slate-950 tracking-tight uppercase">Đề xuất Chi & Quản lý phiếu chi Word (Phần B)</h2>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      Khai báo các đề xuất chi, hệ thống tự động điền thông tin vào mẫu biểu Word (.docx) chuyên dụng và quản lý lưu trữ phiếu chi.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Form thêm đề xuất chi */}
                    <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col gap-4 self-start">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <DollarSign className="w-4 h-4 text-emerald-700" /> Tạo đề xuất chi mới
                      </h3>

                      <form onSubmit={handleAddExpenditureSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-black uppercase text-slate-500">Loại hình đề xuất chi:</label>
                          <select 
                            value={selectedChiType}
                            onChange={(e) => setSelectedChiType(e.target.value as ExpenditureType)}
                            className="bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-bold"
                          >
                            <optgroup label="D3 - Chi bộ Kỹ thuật PCTP tự giữ lại (30%)">
                              <option value="D3_hoatdong">Chi hoạt động (D3_hoatdong)</option>
                              <option value="D3_thamom">Chi thăm ốm đồng chí (D3_thamom)</option>
                              <option value="D3_daihoidang">Chi Đại hội Chi bộ (D3_daihoidang)</option>
                            </optgroup>
                            <optgroup label="PC09 - Văn phòng Đảng uỷ giữ lại">
                              <option value="PC09_hoinghi">Chi hội nghị Đảng uỷ (PC09_hoinghi)</option>
                              <option value="PC09_htxsnv">Chi khen thưởng HTXSNV (PC09_htxsnv)</option>
                              <option value="PC09_ketoan">Chi phụ cấp trách nhiệm Kế toán (PC09_ketoan)</option>
                              <option value="PC09_thaymuc">Chi thay mực máy in (PC09_thaymuc)</option>
                            </optgroup>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-black uppercase text-slate-500">Ngày đề xuất chi (ngày/tháng/năm):</label>
                          <input 
                            type="text"
                            required
                            placeholder="Ví dụ: 04/07/2026"
                            value={chiForm.date}
                            onChange={(e) => setChiForm(prev => ({ ...prev, date: e.target.value }))}
                            className="bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold"
                          />
                        </div>

                        {selectedChiType === 'PC09_ketoan' ? (
                          <div className="flex flex-col gap-1.5 bg-blue-50/50 border border-blue-100 p-3 rounded">
                            <label className="text-[11px] font-black uppercase text-slate-500">Lương cơ bản làm mốc (VND):</label>
                            <input 
                              type="number"
                              required
                              value={chiForm.luongCoBan}
                              onChange={(e) => setChiForm(prev => ({ ...prev, luongCoBan: Number(e.target.value) }))}
                              className="bg-white border border-slate-300 rounded px-3 py-1.5 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold text-right"
                            />
                            <p className="text-[10px] text-blue-700 mt-1 font-semibold">
                              * Phụ cấp kế toán tự động tính = 0.12 * Lương cơ bản * 6 tháng.
                              <br />
                              Số tiền tự động chi: <strong className="text-sm">{(0.12 * chiForm.luongCoBan * 6).toLocaleString('vi-VN')} đ</strong>
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-black uppercase text-slate-500">Số tiền đề xuất chi (đ):</label>
                            <input 
                              type="number"
                              required
                              min="1000"
                              value={chiForm.amount}
                              onChange={(e) => setChiForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                              className="bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold text-right"
                            />
                          </div>
                        )}

                        {(selectedChiType === 'D3_hoatdong' || selectedChiType === 'D3_daihoidang' || selectedChiType === 'PC09_hoinghi') && (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-black uppercase text-slate-500">Cơ sở căn cứ chi:</label>
                            <input 
                              type="text"
                              required
                              placeholder="Ví dụ: Kế hoạch số 45-KH/ĐU ngày 12/12/2025"
                              value={chiForm.coSoCanCu}
                              onChange={(e) => setChiForm(prev => ({ ...prev, coSoCanCu: e.target.value }))}
                              className="bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-bold"
                            />
                          </div>
                        )}

                        {selectedChiType === 'D3_thamom' && (
                          <>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-black uppercase text-slate-500">Đồng chí đề xuất:</label>
                              <input 
                                type="text"
                                required
                                placeholder="Nhập họ tên đồng chí đề xuất..."
                                value={chiForm.nguoiDeXuat}
                                onChange={(e) => setChiForm(prev => ({ ...prev, nguoiDeXuat: e.target.value }))}
                                className="bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-bold"
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-black uppercase text-slate-500">Đồng chí được thăm hỏi:</label>
                              <input 
                                type="text"
                                required
                                placeholder="Nhập họ tên đồng chí ốm đau..."
                                value={chiForm.nguoiThamHoi}
                                onChange={(e) => setChiForm(prev => ({ ...prev, nguoiThamHoi: e.target.value }))}
                                className="bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-bold"
                              />
                            </div>
                          </>
                        )}

                        <button 
                          type="submit"
                          className="w-full mt-2 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <CheckCircle className="w-4 h-4" /> Tạo đề xuất & Sinh File
                        </button>
                      </form>
                    </div>

                    {/* Danh sách đề xuất chi */}
                    <div className="lg:col-span-7 flex flex-col gap-4">
                      {/* Search & Filters */}
                      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 w-full sm:w-auto">
                          <button 
                            onClick={() => setSelectedChiCategory('D3')}
                            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer ${selectedChiCategory === 'D3' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                          >
                            Chi bộ tự giữ lại (D3)
                          </button>
                          <button 
                            onClick={() => setSelectedChiCategory('PC09')}
                            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer ${selectedChiCategory === 'PC09' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                          >
                            Đảng bộ giữ lại (PC09)
                          </button>
                        </div>

                        <input 
                          type="text"
                          placeholder="Tìm kiếm phiếu chi..."
                          value={expSearchQuery}
                          onChange={(e) => setExpSearchQuery(e.target.value)}
                          className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-950 focus:outline-none focus:border-blue-700 w-full sm:w-56"
                        />
                      </div>

                      {/* Expenditure list cards */}
                      <div className="overflow-y-auto max-h-[500px] pr-1 flex flex-col gap-3 custom-scrollbar">
                        {expenditures
                          .filter(e => e.category === selectedChiCategory)
                          .filter(e => {
                            if (!expSearchQuery) return true;
                            const query = expSearchQuery.toLowerCase();
                            return (
                              e.type.toLowerCase().includes(query) ||
                              e.date.includes(query) ||
                              (e.coSoCanCu || '').toLowerCase().includes(query) ||
                              (e.nguoiDeXuat || '').toLowerCase().includes(query) ||
                              (e.nguoiThamHoi || '').toLowerCase().includes(query)
                            );
                          })
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .length === 0 ? (
                            <div className="bg-slate-50 text-slate-400 italic text-center py-16 rounded-xl border border-dashed border-slate-200">
                              Chưa có đề xuất chi nào được ghi nhận cho nhóm {selectedChiCategory}.
                            </div>
                          ) : (
                            expenditures
                              .filter(e => e.category === selectedChiCategory)
                              .filter(e => {
                                if (!expSearchQuery) return true;
                                const query = expSearchQuery.toLowerCase();
                                return (
                                  e.type.toLowerCase().includes(query) ||
                                  e.date.includes(query) ||
                                  (e.coSoCanCu || '').toLowerCase().includes(query) ||
                                  (e.nguoiDeXuat || '').toLowerCase().includes(query) ||
                                  (e.nguoiThamHoi || '').toLowerCase().includes(query)
                                );
                              })
                              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                              .map(e => {
                                let label = '';
                                if (e.type === 'D3_hoatdong') label = 'Chi hoạt động Chi bộ (30%)';
                                else if (e.type === 'D3_thamom') label = 'Chi thăm ốm đồng chí';
                                else if (e.type === 'D3_daihoidang') label = 'Chi Đại hội Chi bộ';
                                else if (e.type === 'PC09_hoinghi') label = 'Chi tổ chức hội nghị';
                                else if (e.type === 'PC09_htxsnv') label = 'Chi khen thưởng HTXSNV';
                                else if (e.type === 'PC09_ketoan') label = 'Chi phụ cấp trách nhiệm Kế toán';
                                else if (e.type === 'PC09_thaymuc') label = 'Chi thay mực máy in';

                                return (
                                  <div key={e.id} className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-4 flex flex-col gap-3 transition shadow-sm">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-xs bg-slate-100 border border-slate-200 font-black text-[#003366] px-2 py-0.5 rounded uppercase font-mono">
                                            {e.type}
                                          </span>
                                          <span className="text-xs text-slate-500 font-bold">{e.date}</span>
                                        </div>
                                        <h4 className="text-slate-900 font-black text-sm mt-1">{label}</h4>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-sm font-black text-slate-950">{e.amount.toLocaleString('vi-VN')} đ</div>
                                        <span className="text-[10px] block text-slate-400 italic">bằng chữ: {e.amountInWords}</span>
                                      </div>
                                    </div>

                                    {/* Detail section */}
                                    <div className="text-xs text-slate-600 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                                      {e.coSoCanCu && <p><strong>Cơ sở căn cứ:</strong> {e.coSoCanCu}</p>}
                                      {e.nguoiDeXuat && <p><strong>Người đề xuất:</strong> {e.nguoiDeXuat}</p>}
                                      {e.nguoiThamHoi && <p><strong>Người được thăm hỏi:</strong> {e.nguoiThamHoi}</p>}
                                      {e.luongCoBan && <p><strong>Mức lương cơ bản:</strong> {e.luongCoBan.toLocaleString('vi-VN')} đ</p>}
                                    </div>

                                    {/* Download and actions */}
                                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                      <button 
                                        type="button"
                                        onClick={() => handleDownloadExpenditure(e.id, e.outputFileName)}
                                        className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#003366] font-bold py-1 px-3 rounded transition cursor-pointer flex items-center gap-1.5"
                                      >
                                        <Download className="w-3.5 h-3.5" /> Tải phiếu chi Word
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleDeleteExpenditure(e.id, e.outputFileName)}
                                        className="text-xs text-rose-600 hover:bg-rose-50 p-1 rounded transition cursor-pointer flex items-center gap-1"
                                        title="Xoá đề xuất"
                                      >
                                        <Trash2 className="w-4 h-4" /> Xoá
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: SỔ THU CHI (PHẦN C) */}
              {activeTab === 'so-thu-chi' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-6 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-black text-slate-950 tracking-tight uppercase">Sổ Quỹ Thu - Chi Đảng Phí (Phần C)</h2>
                      <p className="text-xs text-slate-500 font-semibold mt-1">
                        Lập sổ và theo dõi dòng tiền nộp đảng phí trích giữ lại và các khoản đề xuất chi phục vụ hoạt động của tổ chức Đảng.
                      </p>
                    </div>

                    <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                      <button 
                        onClick={() => setSelectedLedger('KTPCTP')}
                        className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer ${selectedLedger === 'KTPCTP' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                      >
                        Sổ quỹ KTPCTP (D3)
                      </button>
                      <button 
                        onClick={() => setSelectedLedger('PC09')}
                        className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer ${selectedLedger === 'PC09' ? 'bg-[#003366] text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                      >
                        Sổ quỹ PC09 (Đảng bộ)
                      </button>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  {(() => {
                    const currentLedger = selectedLedger === 'KTPCTP' ? ktpctpLedger : pc09Ledger;
                    const initialRow = currentLedger.find(t => t.type === 'initial') || { tonquy: 0 };
                    const initialBalance = initialRow.tonquy;
                    const totalThu = currentLedger.filter(t => t.type === 'thu').reduce((sum, t) => sum + (t.sotienthu || 0), 0);
                    const totalChi = currentLedger.filter(t => t.type === 'chi').reduce((sum, t) => sum + (t.sotienchi || 0), 0);
                    const currentBalance = currentLedger.length > 0 ? currentLedger[currentLedger.length - 1].tonquy : 0;

                    return (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Số dư mốc ban đầu</span>
                              <button 
                                onClick={() => setShowEditInitialBalances(true)}
                                className="text-blue-700 hover:text-blue-900 text-[10px] font-black uppercase cursor-pointer tracking-wider"
                              >
                                [Sửa mốc]
                              </button>
                            </div>
                            <div className="text-lg font-black text-slate-800">{initialBalance.toLocaleString('vi-VN')} đ</div>
                            <span className="text-[9px] text-slate-500 font-semibold">(Mốc 31/05/2026)</span>
                          </div>

                          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 shadow-sm flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Tổng thu trích giữ lại</span>
                            <div className="text-lg font-black text-emerald-800">+{totalThu.toLocaleString('vi-VN')} đ</div>
                            <span className="text-[9px] text-emerald-600 font-semibold">(Từ tháng 06/2026 đến nay)</span>
                          </div>

                          <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-4 shadow-sm flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase text-rose-600 tracking-wider">Tổng chi hoạt động</span>
                            <div className="text-lg font-black text-rose-800">-{totalChi.toLocaleString('vi-VN')} đ</div>
                            <span className="text-[9px] text-rose-600 font-semibold">({currentLedger.filter(t => t.type === 'chi').length} phiếu chi đã sinh)</span>
                          </div>

                          <div className="bg-[#003366] text-white border-2 border-slate-950 rounded-xl p-4 shadow-sm flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase text-blue-200 tracking-wider">Tồn quỹ hiện tại</span>
                            <div className="text-xl font-black">{currentBalance.toLocaleString('vi-VN')} đ</div>
                            <span className="text-[9px] text-blue-200 font-semibold">({selectedLedger === 'KTPCTP' ? 'Chi bộ giữ lại 30%' : 'Đảng uỷ giữ lại 30%'})</span>
                          </div>
                        </div>

                        {/* Sổ quỹ chi tiết Table */}
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="text-xs font-black text-[#003366] uppercase tracking-wider flex items-center gap-1.5">
                              <BookOpen className="w-4 h-4 text-[#003366]" /> Sổ quỹ chi tiết {selectedLedger === 'KTPCTP' ? 'Chi bộ Kỹ thuật PCTP' : 'Đảng bộ PC09'}
                            </h3>
                            <span className="text-[10px] bg-[#003366]/10 border border-[#003366]/20 px-2 py-0.5 rounded text-[#003366] font-bold">
                              Tháng hiển thị: {selectedMonth.split('-').reverse().join('/')}
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase tracking-wider">
                                  <th className="py-3 px-4 w-12 text-center">STT</th>
                                  <th className="py-3 px-4 w-28">Ngày tháng</th>
                                  <th className="py-3 px-4">Diễn giải nội dung</th>
                                  <th className="py-3 px-4 w-32 text-right">Thu (+)</th>
                                  <th className="py-3 px-4 w-32 text-right">Chi (-)</th>
                                  <th className="py-3 px-4 w-36 text-right bg-slate-50/50">Tồn quỹ</th>
                                  <th className="py-3 px-4 w-24 text-center">Phiếu chi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-medium">
                                {currentLedger.map((row, index) => (
                                  <tr 
                                    key={index} 
                                    className={`hover:bg-slate-50/50 transition-colors ${row.type === 'initial' ? 'bg-slate-50 font-semibold text-slate-500 italic' : ''}`}
                                  >
                                    <td className="py-3 px-4 text-center text-slate-400 font-mono">
                                      {row.type === 'initial' ? '-' : index}
                                    </td>
                                    <td className="py-3 px-4 text-slate-600 font-mono">
                                      {row.date || '-'}
                                    </td>
                                    <td className="py-3 px-4 text-slate-900 font-semibold">
                                      {row.noidung}
                                    </td>
                                    <td className="py-3 px-4 text-right text-emerald-700 font-mono font-bold">
                                      {row.sotienthu > 0 ? `+${row.sotienthu.toLocaleString('vi-VN')} đ` : '-'}
                                    </td>
                                    <td className="py-3 px-4 text-right text-rose-600 font-mono font-bold">
                                      {row.sotienchi > 0 ? `-${row.sotienchi.toLocaleString('vi-VN')} đ` : '-'}
                                    </td>
                                    <td className="py-3 px-4 text-right text-slate-950 font-mono font-black bg-slate-50/20">
                                      {row.tonquy.toLocaleString('vi-VN')} đ
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                      {row.type === 'chi' && row.id ? (
                                        <button 
                                          type="button"
                                          onClick={() => handleDownloadExpenditure(row.id, `${row.date.replace(/\//g, '-')}.docx`)}
                                          className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 font-bold px-2 py-0.5 rounded hover:bg-blue-100 transition cursor-pointer"
                                          title="Tải phiếu chi"
                                        >
                                          Tải về
                                        </button>
                                      ) : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 font-bold uppercase tracking-wider shadow-sm">
        Phần mềm Quản lý Đảng phí chuyên dụng • Thiết kế hiện đại, khoa học, bảo mật dữ liệu tuyệt đối.
      </footer>

      {/* MODAL: EDIT INITIAL BALANCES */}
      {showEditInitialBalances && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveInitialBalances} className="bg-white border-2 border-slate-950 rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            <h3 className="text-base font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
              <Settings className="w-5 h-5 text-[#003366]" /> Điều chỉnh Số dư mốc ban đầu
            </h3>

            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Nhập giá trị số dư mốc ban đầu (Mốc tính đến ngày 31/05/2026) cho cả hai Sổ quỹ phần C.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Sổ quỹ KTPCTP (D3) (đ):</label>
              <input 
                type="number" 
                required
                value={initialBalancesForm.ktpctp}
                onChange={(e) => setInitialBalancesForm(prev => ({ ...prev, ktpctp: Number(e.target.value) || 0 }))}
                className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold"
                placeholder="Ví dụ: 7050300"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Sổ quỹ PC09 (Đảng bộ) (đ):</label>
              <input 
                type="number" 
                required
                value={initialBalancesForm.pc09}
                onChange={(e) => setInitialBalancesForm(prev => ({ ...prev, pc09: Number(e.target.value) || 0 }))}
                className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold"
                placeholder="Ví dụ: 22196910"
              />
            </div>

            <div className="flex gap-2.5 justify-end mt-2">
              <button 
                type="button"
                onClick={() => setShowEditInitialBalances(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-[#003366] hover:bg-slate-800 text-white rounded text-xs font-black uppercase tracking-wider transition shadow-sm cursor-pointer"
              >
                Lưu lại
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD MEMBER */}
      {showAddMember && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAddMemberSubmit} className="bg-white border-2 border-slate-950 rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            <h3 className="text-base font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-700" /> Thêm Đảng viên mới
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Họ và tên:</label>
              <input 
                type="text" 
                required
                value={newMemberForm.name}
                onChange={(e) => setNewMemberForm(prev => ({ ...prev, name: e.target.value }))}
                className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-bold"
                placeholder="Nhập họ và tên..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase text-slate-500">Ngày vào ngành (dd/mm/yyyy):</label>
                <input 
                  type="text" 
                  required
                  placeholder="dd/mm/yyyy"
                  value={joinDateInput}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (val.length > 8) val = val.slice(0, 8);
                    let formatted = val;
                    if (val.length > 4) {
                      formatted = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                    } else if (val.length > 2) {
                      formatted = `${val.slice(0, 2)}/${val.slice(2)}`;
                    }
                    setJoinDateInput(formatted);
                  }}
                  className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase text-slate-500">Tháng nhập mốc:</label>
                <input 
                  type="month" 
                  required
                  value={newMemberForm.baseMonth}
                  onChange={(e) => setNewMemberForm(prev => ({ ...prev, baseMonth: e.target.value }))}
                  className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Chi bộ Đội sinh hoạt:</label>
              <select 
                value={newMemberForm.baseChiBo}
                onChange={(e) => setNewMemberForm(prev => ({ ...prev, baseChiBo: e.target.value as ChiBoType }))}
                className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-bold"
              >
                {CHI_BO_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase text-slate-500">Hệ số lương:</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  value={newMemberForm.baseHeSoLuong}
                  onChange={(e) => setNewMemberForm(prev => ({ ...prev, baseHeSoLuong: Number(e.target.value) }))}
                  className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold text-right"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase text-slate-500">Hệ số chức vụ:</label>
                <input 
                  type="number" 
                  step="0.01"
                  required
                  value={newMemberForm.baseHeSoChucVu}
                  onChange={(e) => setNewMemberForm(prev => ({ ...prev, baseHeSoChucVu: Number(e.target.value) }))}
                  className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold text-right"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 justify-end mt-4 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setShowAddMember(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-[#003366] hover:bg-blue-900 text-white rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
                id="btn-add-member-submit"
              >
                Lưu lại
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DISABLE MEMBER */}
      {showDisableMember && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleDisableSubmit} className="bg-white border-2 border-slate-950 rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            <h3 className="text-base font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-rose-600" /> Vô hiệu hoá tạm thời/vĩnh viễn
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Chọn Đảng viên:</label>
              <select 
                value={disableForm.memberId}
                onChange={(e) => setDisableForm(prev => ({ ...prev, memberId: e.target.value }))}
                className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-bold"
              >
                <option value="">-- Chọn Đảng viên --</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.baseChiBo})</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Phương thức vô hiệu hoá:</label>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  type="button"
                  onClick={() => setDisableForm(prev => ({ ...prev, type: 'temporary' }))}
                  className={`py-2.5 px-3 rounded text-xs font-black uppercase tracking-wider border transition cursor-pointer ${disableForm.type === 'temporary' ? 'bg-blue-50 border-blue-700 text-blue-800' : 'bg-slate-50 border-slate-300 text-slate-600 hover:text-slate-950'}`}
                >
                  Có thời hạn (Tháng)
                </button>
                <button 
                  type="button"
                  onClick={() => setDisableForm(prev => ({ ...prev, type: 'permanent' }))}
                  className={`py-2.5 px-3 rounded text-xs font-black uppercase tracking-wider border transition cursor-pointer ${disableForm.type === 'permanent' ? 'bg-blue-50 border-blue-700 text-blue-800' : 'bg-slate-50 border-slate-300 text-slate-600 hover:text-slate-950'}`}
                >
                  Không thời hạn
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase text-slate-500">Thời điểm bắt đầu:</label>
                <input 
                  type="month" 
                  value={disableForm.startMonth}
                  onChange={(e) => setDisableForm(prev => ({ ...prev, startMonth: e.target.value }))}
                  className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold"
                />
              </div>

              {disableForm.type === 'temporary' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase text-slate-500">Số tháng tạm hoãn:</label>
                  <input 
                    type="number" 
                    min="1"
                    value={disableForm.durationMonths}
                    onChange={(e) => setDisableForm(prev => ({ ...prev, durationMonths: Number(e.target.value) }))}
                    className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold text-right"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Lý do / Ghi chú:</label>
              <textarea 
                value={disableForm.note}
                onChange={(e) => setDisableForm(prev => ({ ...prev, note: e.target.value }))}
                className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs text-slate-950 focus:outline-none focus:border-blue-700 h-16 resize-none font-bold"
                placeholder="Đi học quân sự, thai sản, điều trị bệnh..."
              />
            </div>

            {/* Delete entirely shortcut */}
            {disableForm.memberId && (
              <div className="border-t border-slate-150 pt-3 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Xoá vĩnh viễn khỏi Database?</span>
                <button 
                  type="button"
                  onClick={() => {
                    const selected = members.find(m => m.id === disableForm.memberId);
                    if (selected) {
                      setShowDisableMember(false);
                      handleDeleteMember(selected.id, selected.name);
                    }
                  }}
                  className="px-2.5 py-1.5 bg-rose-50 border border-rose-300 hover:bg-rose-100 text-rose-700 text-[10px] font-black rounded uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
                  id="btn-delete-member"
                >
                  <UserX className="w-3 h-3" /> Xoá Đảng viên này
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 justify-end mt-2 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setShowDisableMember(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
                id="btn-disable-submit"
              >
                Vô hiệu hoá
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DECLARE CHANGE */}
      {showDeclareChange && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleDeclareChangeSubmit} className="bg-white border-2 border-slate-950 rounded-xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
            <h3 className="text-base font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
              <Edit className="w-5 h-5 text-amber-600" /> Khai báo thay đổi thông tin
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Chọn Đảng viên biến động:</label>
              <select 
                value={changeForm.memberId}
                onChange={(e) => {
                  const mId = e.target.value;
                  const found = members.find(m => m.id === mId);
                  setChangeForm(prev => ({ 
                    ...prev, 
                    memberId: mId,
                    newChiBo: found ? found.baseChiBo : prev.newChiBo,
                    newHeSoLuong: found ? found.baseHeSoLuong : prev.newHeSoLuong,
                    newHeSoChucVu: found ? found.baseHeSoChucVu : prev.newHeSoChucVu
                  }));
                }}
                className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-bold"
              >
                <option value="">-- Chọn Đảng viên --</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.baseChiBo})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase text-slate-500">Thời điểm áp dụng:</label>
                <input 
                  type="month" 
                  value={changeForm.effectiveMonth}
                  onChange={(e) => setChangeForm(prev => ({ ...prev, effectiveMonth: e.target.value }))}
                  className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase text-slate-500">Chọn nội dung:</label>
                <select 
                  value={changeForm.field}
                  onChange={(e) => setChangeForm(prev => ({ ...prev, field: e.target.value as any }))}
                  className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-bold"
                >
                  <option value="all">Khai báo thay đổi đồng thời</option>
                  <option value="chiBo">Thay đổi Chi bộ Đội</option>
                  <option value="heSoLuong">Thay đổi Hệ số lương</option>
                  <option value="heSoChucVu">Thay đổi Hệ số chức vụ</option>
                </select>
              </div>
            </div>

            {/* Field options depend on selection */}
            {(changeForm.field === 'chiBo' || changeForm.field === 'all') && (
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3.5 rounded border border-slate-200">
                <label className="text-[11px] font-black uppercase text-blue-700">Chi bộ Đội mới:</label>
                <select 
                  value={changeForm.newChiBo}
                  onChange={(e) => setChangeForm(prev => ({ ...prev, newChiBo: e.target.value as ChiBoType }))}
                  className="bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 font-bold focus:outline-none"
                >
                  {CHI_BO_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {(changeForm.field === 'heSoLuong' || changeForm.field === 'all') && (
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3.5 rounded border border-slate-200">
                <label className="text-[11px] font-black uppercase text-blue-700">Hệ số lương mới:</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={changeForm.newHeSoLuong}
                  onChange={(e) => setChangeForm(prev => ({ ...prev, newHeSoLuong: Number(e.target.value) }))}
                  className="bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 font-mono font-bold text-right focus:outline-none"
                />
              </div>
            )}

            {(changeForm.field === 'heSoChucVu' || changeForm.field === 'all') && (
              <div className="flex flex-col gap-1.5 bg-slate-50 p-3.5 rounded border border-slate-200">
                <label className="text-[11px] font-black uppercase text-blue-700">Hệ số chức vụ mới:</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={changeForm.newHeSoChucVu}
                  onChange={(e) => setChangeForm(prev => ({ ...prev, newHeSoChucVu: Number(e.target.value) }))}
                  className="bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 font-mono font-bold text-right focus:outline-none"
                />
              </div>
            )}

            <div className="flex items-center gap-3 justify-end mt-2 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setShowDeclareChange(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
                id="btn-declare-change-submit"
              >
                Lưu biến động
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: UPDATE BASE SALARY */}
      {showUpdateBaseSalary && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSalarySubmit} className="bg-white border-2 border-slate-950 rounded-xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-2xl">
            <h3 className="text-base font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-blue-700" /> Cập nhật mức Lương cơ bản mới
            </h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Mức lương cơ bản sau thay đổi (VND):</label>
              <input 
                type="number" 
                required
                value={salaryForm.amount}
                onChange={(e) => setSalaryForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold text-right"
                placeholder="Ví dụ: 2530000"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500">Thời điểm áp dụng:</label>
              <input 
                type="month" 
                required
                value={salaryForm.effectiveMonth}
                onChange={(e) => setSalaryForm(prev => ({ ...prev, effectiveMonth: e.target.value }))}
                className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-950 focus:outline-none focus:border-blue-700 font-mono font-bold"
              />
            </div>

            <div className="flex items-center gap-3 justify-end mt-4 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setShowUpdateBaseSalary(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
                id="btn-update-salary-submit"
              >
                Cập nhật
              </button>
            </div>
          </form>
        </div>
      )}

      {/* OFF-SCREEN DOM CONTAINER FOR IMAGE CAPTURE */}
      {teamToCapture && (() => {
        const { active, totalFees } = getTeamStats(teamToCapture);
        const displayMonth = selectedMonth.split('-')[1] + '/' + selectedMonth.split('-')[0];
        
        return (
          <div 
            style={{ 
              position: 'fixed',
              top: '0',
              left: '0',
              width: '0',
              height: '0',
              overflow: 'hidden',
              zIndex: -9999,
              pointerEvents: 'none'
            }}
          >
            <div 
              id="capture-container-target"
              className="bg-slate-50 p-10 border-4 border-slate-300 rounded-2xl flex flex-col gap-8 shadow-2xl"
              style={{ 
                width: '1280px', // Fixed wide viewport for perfect 4-column alignment
                fontFamily: "'Inter', sans-serif",
                boxSizing: 'border-box'
              }}
            >
              {/* Document Header */}
              <div className="border-b-4 border-[#003366] pb-6 flex justify-between items-end">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#003366] bg-blue-50 border border-blue-200 px-3 py-1 rounded">
                    CÔNG AN TỈNH LÂM ĐỒNG • PHÒNG KỸ THUẬT HÌSỰ
                  </span>
                  <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight mt-2.5">
                    BẢNG CHI TIẾT ĐẢNG PHÍ ĐẢNG VIÊN
                  </h1>
                  <p className="text-sm text-[#003366] font-bold uppercase tracking-wider mt-1">
                    Đơn vị sinh hoạt: Chi bộ Đội {teamToCapture}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">THÁNG BÁO CÁO</p>
                  <p className="text-2xl font-black text-[#003366] tracking-tight mt-1">Tháng {displayMonth}</p>
                </div>
              </div>

              {/* Grid of Members: exactly 4 columns */}
              <div className="grid grid-cols-4 gap-4">
                {active.map((m, index) => {
                  return (
                    <div 
                      key={m.memberId} 
                      className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden"
                      style={{ minHeight: '190px' }}
                    >
                      {/* Order index badge */}
                      <div className="absolute top-0 right-0 bg-[#003366] text-white text-[10px] font-black px-2.5 py-1 rounded-bl-lg">
                        #{index + 1}
                      </div>

                      {/* Header Info */}
                      <div className="border-b border-slate-100 pb-2 pr-6">
                        <h4 className="font-extrabold text-sm text-slate-950 truncate leading-snug">{m.name}</h4>
                        <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-wide">
                          Vào ngành: {m.joinDate.split('-').reverse().join('/')}
                        </p>
                      </div>

                      {/* Coefficients Calculations Box */}
                      <div className="bg-slate-50 rounded-lg border border-slate-150 p-2.5 my-3 text-[10px] text-slate-700 font-mono space-y-1">
                        <div className="flex justify-between">
                          <span>Hệ số lương:</span>
                          <span className="text-slate-950 font-extrabold">{m.heSoLuong}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>HS chức vụ:</span>
                          <span className="text-slate-950 font-extrabold">{m.heSoChucVu || 0}</span>
                        </div>
                        <div className="flex justify-between text-amber-800">
                          <span>Thâm niên:</span>
                          <span className="font-extrabold">{m.seniorityYears} năm</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Phụ cấp TN:</span>
                          <span className="text-slate-950 font-extrabold">{(m.tiengThamNien).toLocaleString('vi-VN')}</span>
                        </div>
                        <div className="border-t border-slate-200 pt-1.5 mt-1.5 flex justify-between font-sans text-[11px] font-bold text-slate-950">
                          <span>Tổng lương+TN:</span>
                          <span>{m.tongLuong.toLocaleString('vi-VN')} đ</span>
                        </div>
                      </div>

                      {/* Fee Result Highlight */}
                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Đảng phí (1%)</span>
                        <span className="text-sm font-black text-blue-700 font-mono">
                          {m.dangPhi.toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Aggregate Totals & Signatures */}
              <div className="mt-4 border-t-2 border-slate-200 pt-6 grid grid-cols-2 gap-8">
                {/* Totals Box */}
                <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 flex justify-between items-center">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">THỐNG KÊ ĐỘI</p>
                    <p className="text-xs text-slate-700 font-semibold">
                      Tổng số Đảng viên nộp: <strong className="text-slate-900 font-extrabold">{active.length} đ/v</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-[#003366] uppercase tracking-wider">TỔNG ĐẢNG PHÍ PHẢI THU</p>
                    <p className="text-2xl font-black text-[#003366] font-mono mt-0.5">
                      {totalFees.toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                </div>

                {/* Informative reassurance */}
                <div className="text-right text-[11px] text-slate-400 flex flex-col justify-center font-semibold pr-2">
                  <p>Phần mềm Quản lý & Tính toán Đảng phí Chuyên dụng</p>
                  <p className="mt-0.5 italic">Thời gian xuất ảnh: {new Date().toLocaleString('vi-VN')}</p>
                </div>
              </div>

              {/* Signatures Row */}
              <div className="mt-8 grid grid-cols-2 gap-8 text-center pb-4">
                <div>
                  <p className="text-xs font-black uppercase text-slate-500 tracking-wider">ĐẠI DIỆN ĐỘI / CHI BỘ</p>
                  <p className="text-[10px] text-slate-400 italic mt-1">(Ký và ghi rõ họ tên)</p>
                  <div className="h-20"></div>
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-[#003366] tracking-wider">NGƯỜI LẬP BIỂU</p>
                  <p className="text-[10px] text-slate-400 italic mt-1">(Ký và ghi rõ họ tên)</p>
                  <div className="h-20"></div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
