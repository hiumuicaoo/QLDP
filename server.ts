/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import { 
  Member, 
  ChangeDeclaration, 
  DisableDeclaration, 
  BaseSalaryHistory, 
  ChiBoType,
  MemberCalculationResult,
  Expenditure,
  ExpenditureType
} from './src/types';

import { calculateMemberFee } from './src/utils/calculator';

// Vietnamese Number to Words Conversion Helper
function numberToVietnameseWords(num: number): string {
  if (num === 0) return 'Không đồng';
  
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  
  let integerPart = Math.floor(num);
  
  function readThreeDigits(three: number, showZeroHundred: boolean): string {
    const hundred = Math.floor(three / 100);
    const ten = Math.floor((three % 100) / 10);
    const unit = three % 10;
    let res = '';
    
    if (hundred > 0 || showZeroHundred) {
      res += digits[hundred] + ' trăm ';
    }
    
    if (ten > 0) {
      if (ten === 1) {
        res += 'mười ';
      } else {
        res += digits[ten] + ' mươi ';
      }
    } else if (hundred > 0 && unit > 0) {
      res += 'lẻ ';
    }
    
    if (unit > 0) {
      if (unit === 1 && ten > 1) {
        res += 'mốt';
      } else if (unit === 5 && ten > 0) {
        res += 'lăm';
      } else if (unit === 4 && ten > 1) {
        res += 'tư';
      } else {
        res += digits[unit];
      }
    }
    
    return res.trim();
  }
  
  let str = '';
  const groups: number[] = [];
  while (integerPart > 0) {
    groups.push(integerPart % 1000);
    integerPart = Math.floor(integerPart / 1000);
  }
  
  for (let i = groups.length - 1; i >= 0; i--) {
    const val = groups[i];
    if (val > 0) {
      const showZeroHundred = i < groups.length - 1;
      const groupWords = readThreeDigits(val, showZeroHundred);
      str += groupWords + ' ' + units[i] + ' ';
    }
  }
  
  str = str.trim();
  if (str.length > 0) {
    str = str.charAt(0).toUpperCase() + str.slice(1) + ' đồng';
  } else {
    str = 'Không đồng';
  }
  return str.replace(/\s+/g, ' ');
}

// Resolve Word Templates and Output directories safely
function getDangPhiDir() {
  let dir = 'D:\\DANGPHI';
  if (process.platform !== 'win32') {
    dir = './dangphi';
  }
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error('Could not create DANGPHI dir, using local ./dangphi', err);
      dir = './dangphi';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }
  return dir;
}

const dangPhiDir = getDangPhiDir();
const FILEMAU_DIR = path.join(dangPhiDir, 'FILEMAU');
const DEXUATCHI_D3_DIR = path.join(dangPhiDir, 'DEXUATCHI', 'D3');
const DEXUATCHI_PC09_DIR = path.join(dangPhiDir, 'DEXUATCHI', 'PC09');

// Ensure directories exist
if (!fs.existsSync(FILEMAU_DIR)) fs.mkdirSync(FILEMAU_DIR, { recursive: true });
if (!fs.existsSync(DEXUATCHI_D3_DIR)) fs.mkdirSync(DEXUATCHI_D3_DIR, { recursive: true });
if (!fs.existsSync(DEXUATCHI_PC09_DIR)) fs.mkdirSync(DEXUATCHI_PC09_DIR, { recursive: true });

// Self-healing Docx Fallback File Generator
function createDefaultDocxTemplateIfMissing(filePath: string, title: string, placeholders: string[]) {
  if (fs.existsSync(filePath)) return;
  
  try {
    const zip = new PizZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    const placeholderParagraphs = placeholders.map(p => 
      `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>${p}: [${p}]</w:t></w:r></w:p>`
    ).join('\n');
    
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
          <w:b/>
          <w:sz w:val="32"/>
        </w:rPr>
        <w:t>${title.toUpperCase()}</w:t>
      </w:r>
    </w:p>
    <w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>==================================================</w:t></w:r></w:p>
    ${placeholderParagraphs}
    <w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr><w:t>==================================================</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="20"/></w:rPr><w:t>Biểu mẫu tự động sinh ngày [dd]/[mm]/[yyyy]</w:t></w:r></w:p>
  </w:body>
</w:document>`;
    
    zip.file("word/document.xml", documentXml);
    const buffer = zip.generate({ type: "nodebuffer" });
    fs.writeFileSync(filePath, buffer);
    console.log(`Created auto-heal fallback template: ${filePath}`);
  } catch (err) {
    console.error(`Failed to seed default template: ${filePath}`, err);
  }
}

function seedWordTemplates() {
  createDefaultDocxTemplateIfMissing(path.join(FILEMAU_DIR, '[D3] PHIEU CHI TIEN HOATDONG.docx'), "Phiếu Chi Tiền Hoạt Động - Đội KTPCTP", ['dd', 'mm', 'yyyy', 'Cơ sở căn cứ', 'số tiền', 'số tiền bằng chữ']);
  createDefaultDocxTemplateIfMissing(path.join(FILEMAU_DIR, '[D3] PHIEU CHI TIEN THAMOM.docx'), "Phiếu Chi Tiền Thăm Ốm - Đội KTPCTP", ['dd', 'mm', 'yyyy', 'Họ và tên người đề xuất', 'Họ và tên thăm hỏi', 'số tiền', 'số tiền bằng chữ']);
  createDefaultDocxTemplateIfMissing(path.join(FILEMAU_DIR, '[D3] PHIEU CHI TIEN DAIHOIDANG.docx'), "Phiếu Chi Tiền Đại Hội Đảng - Đội KTPCTP", ['dd', 'mm', 'yyyy', 'Cơ sở căn cứ', 'số tiền', 'số tiền bằng chữ']);
  
  createDefaultDocxTemplateIfMissing(path.join(FILEMAU_DIR, '[PC09] PHIEU CHI TIEN HOINGHI.docx'), "Phiếu Chi Tiền Hội Nghị - Đảng Bộ PC09", ['dd', 'mm', 'yyyy', 'Cơ sở căn cứ', 'số tiền', 'số tiền bằng chữ']);
  createDefaultDocxTemplateIfMissing(path.join(FILEMAU_DIR, '[PC09] PHIEU CHI TIEN HTXSNV.docx'), "Phiếu Chi Tiền HTXSNV - Khen Thưởng - Đảng Bộ PC09", ['dd', 'mm', 'yyyy', 'số tiền', 'số tiền bằng chữ']);
  createDefaultDocxTemplateIfMissing(path.join(FILEMAU_DIR, '[PC09] PHIEU CHI TIEN KETOAN.docx'), "Phiếu Chi Tiền Kế Toán - Đảng Bộ PC09", ['dd', 'mm', 'yyyy', 'Lương cơ bản', 'số tiền', 'số tiền bằng chữ']);
  createDefaultDocxTemplateIfMissing(path.join(FILEMAU_DIR, '[PC09] PHIEU CHI TIEN THAYMUC.docx'), "Phiếu Chi Tiền Thay Mực - Đảng Bộ PC09", ['dd', 'mm', 'yyyy', 'số tiền', 'số tiền bằng chữ']);
}

function generateDocx(templatePath: string, outputPath: string, data: Record<string, any>) {
  try {
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      delimiters: {
        start: '[',
        end: ']'
      },
      paragraphLoop: true,
      linebreaks: true
    });
    
    doc.render(data);
    
    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });
    
    const parentDir = path.dirname(outputPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, buf);
    console.log(`Generated file: ${outputPath}`);
    return true;
  } catch (err) {
    console.error(`Error generating docx from ${templatePath} to ${outputPath}`, err);
    throw err;
  }
}

const app = express();
app.use(express.json());

const PORT = 3000;

// Resolve DB path
function getDatabaseDir() {
  let dir = process.env.DATABASE_DIR || './data';
  
  // If we are on Linux/Cloud Run, but the path is set to a Windows drive (e.g. D:\DANGPHI),
  // we must fall back to a local relative folder so it doesn't fail to write in the cloud container.
  if (process.platform !== 'win32' && (dir.startsWith('D:') || dir.startsWith('C:') || dir.includes('\\'))) {
    dir = './data';
  }
  
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error(`Could not create directory ${dir}, falling back to ./data`, err);
      dir = './data';
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }
  return dir;
}

const dbDir = getDatabaseDir();
console.log(`Using database directory: ${path.resolve(dbDir)}`);

// File paths
const MEMBERS_FILE = path.join(dbDir, 'members.json');
const CHANGES_FILE = path.join(dbDir, 'changes.json');
const DISABLES_FILE = path.join(dbDir, 'disables.json');
const SALARIES_FILE = path.join(dbDir, 'base_salaries.json');
const REPORTS_INPUTS_FILE = path.join(dbDir, 'reports_inputs.json');

// Helper to read JSON safely
function readJSON<T>(file: string, defaultValue: T): T {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2), 'utf-8');
    return defaultValue;
  }
  try {
    const content = fs.readFileSync(file, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    console.error(`Error reading ${file}, returning default`, err);
    return defaultValue;
  }
}

// Helper to write JSON
function writeJSON<T>(file: string, data: T) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing to ${file}`, err);
  }
}

// Initial Seeding
function seedDatabase() {
  // Seed Base Salary History
  const salaries = readJSON<BaseSalaryHistory[]>(SALARIES_FILE, []);
  if (salaries.length === 0) {
    salaries.push({
      id: 'lcb-init',
      amount: 2340000,
      effectiveMonth: '2026-06',
      createdAt: new Date().toISOString()
    });
    writeJSON(SALARIES_FILE, salaries);
  }

  // Seed Members (Baseline 2026-06)
  const members = readJSON<Member[]>(MEMBERS_FILE, []);
  if (members.length === 0) {
    const initialMembers: Member[] = [
      {
        id: 'member-1',
        name: 'Nguyễn Văn An',
        joinDate: '2018-05-15',
        baseMonth: '2026-06',
        baseChiBo: 'Khám nghiệm hiện trường',
        baseHeSoLuong: 4.4,
        baseHeSoChucVu: 0.4
      },
      {
        id: 'member-2',
        name: 'Trần Thị Bình',
        joinDate: '2022-09-01',
        baseMonth: '2026-06',
        baseChiBo: 'Khám nghiệm hiện trường',
        baseHeSoLuong: 3.33,
        baseHeSoChucVu: 0.0
      },
      {
        id: 'member-3',
        name: 'Lê Văn Cường',
        joinDate: '2015-11-20',
        baseMonth: '2026-06',
        baseChiBo: 'Giám định',
        baseHeSoLuong: 5.08,
        baseHeSoChucVu: 0.6
      },
      {
        id: 'member-4',
        name: 'Phạm Thị Dung',
        joinDate: '2021-03-10',
        baseMonth: '2026-06',
        baseChiBo: 'Giám định',
        baseHeSoLuong: 3.66,
        baseHeSoChucVu: 0.2
      },
      {
        id: 'member-5',
        name: 'Hoàng Văn Em',
        joinDate: '2012-08-01',
        baseMonth: '2026-06',
        baseChiBo: 'Kỹ thuật phòng chống tội phạm',
        baseHeSoLuong: 5.76,
        baseHeSoChucVu: 0.8
      },
      {
        id: 'member-6',
        name: 'Vũ Thị Giang',
        joinDate: '2020-07-15',
        baseMonth: '2026-06',
        baseChiBo: 'Kỹ thuật phòng chống tội phạm',
        baseHeSoLuong: 4.06,
        baseHeSoChucVu: 0.0
      }
    ];
    writeJSON(MEMBERS_FILE, initialMembers);
  }
}

seedDatabase();
seedWordTemplates();

// API Endpoints

// GET /api/expenditures - Get all expenditure records
app.get('/api/expenditures', (req, res) => {
  const EXPENDITURES_FILE = path.join(dbDir, 'expenditures.json');
  const expenditures = readJSON<any[]>(EXPENDITURES_FILE, []);
  res.json({ expenditures });
});

// POST /api/expenditures - Add a new expenditure and generate word file
app.post('/api/expenditures', (req, res) => {
  const { 
    type, 
    date, 
    amount, 
    coSoCanCu, 
    nguoiDeXuat, 
    nguoiThamHoi, 
    luongCoBan 
  } = req.body;
  
  if (!type || !date) {
    return res.status(400).json({ error: 'Thiếu thông tin chi bắt buộc' });
  }
  
  // 1. Calculate amount if accountant type
  let finalAmount = Number(amount) || 0;
  if (type === 'PC09_ketoan') {
    const base = Number(luongCoBan) || 0;
    finalAmount = 0.12 * base * 6;
  }
  
  // 2. Generate Vietnamese word representation
  const amountInWords = numberToVietnameseWords(finalAmount);
  
  // 3. Parse date (robust parsing for yyyy-mm-dd or dd/mm/yyyy or dd-mm-yyyy)
  let dd = '';
  let mm = '';
  let yyyy = '';
  
  if (date.includes('/')) {
    const parts = date.split('/');
    if (parts.length === 3) {
      dd = parts[0].trim().padStart(2, '0');
      mm = parts[1].trim().padStart(2, '0');
      yyyy = parts[2].trim();
    }
  } else if (date.includes('-')) {
    const parts = date.split('-');
    if (parts.length === 3) {
      if (parts[0].trim().length === 4) {
        yyyy = parts[0].trim();
        mm = parts[1].trim().padStart(2, '0');
        dd = parts[2].trim().padStart(2, '0');
      } else {
        dd = parts[0].trim().padStart(2, '0');
        mm = parts[1].trim().padStart(2, '0');
        yyyy = parts[2].trim();
      }
    }
  }

  if (!dd || !mm || !yyyy || isNaN(Number(dd)) || isNaN(Number(mm)) || isNaN(Number(yyyy))) {
    const dObj = new Date();
    dd = String(dObj.getDate()).padStart(2, '0');
    mm = String(dObj.getMonth() + 1).padStart(2, '0');
    yyyy = String(dObj.getFullYear());
  }
  
  const dateFormatted = `${dd}/${mm}/${yyyy}`; // dd/mm/yyyy
  
  // 4. Map placeholders for docx
  const cleanCoSoCanCu = coSoCanCu || '';
  const cleanNguoiDeXuat = nguoiDeXuat || '';
  const cleanNguoiThamHoi = nguoiThamHoi || '';
  const cleanLuongCoBan = luongCoBan ? (Number(luongCoBan) || 0).toLocaleString('vi-VN') : '';

  const dataForTemplate: Record<string, any> = {
    'dd': dd,
    'mm': mm,
    'yyyy': yyyy,
    'ngày': dd,
    'tháng': mm,
    'năm': yyyy,
    'ngay': dd,
    'thang': mm,
    'nam': yyyy,
    'số tiền': finalAmount.toLocaleString('vi-VN'),
    'sotien': finalAmount.toLocaleString('vi-VN'),
    'số tiền bằng chữ': amountInWords,
    'sotienbangchu': amountInWords,
    'Cơ sở căn cứ': cleanCoSoCanCu,
    'coSoCanCu': cleanCoSoCanCu,
    'Cơ sở căn cứ chi': cleanCoSoCanCu,
    'cơ sở căn cứ chi': cleanCoSoCanCu,
    'cơ sở căn cứ': cleanCoSoCanCu,
    'Họ và tên người đề xuất': cleanNguoiDeXuat,
    'nguoiDeXuat': cleanNguoiDeXuat,
    'Họ và tên thăm hỏi': cleanNguoiThamHoi,
    'nguoiThamHoi': cleanNguoiThamHoi,
    'Lương cơ bản': cleanLuongCoBan,
    'luongCoBan': cleanLuongCoBan,
  };
  
  let templateFileName = '';
  let outputDir = '';
  let outputFileNameTemplate = '';
  let category: 'D3' | 'PC09' = 'D3';
  
  if (type === 'D3_hoatdong') {
    templateFileName = '[D3] PHIEU CHI TIEN HOATDONG.docx';
    outputDir = DEXUATCHI_D3_DIR;
    outputFileNameTemplate = '[D3] PHIEU CHI TIEN HOATDONG.docx';
    category = 'D3';
  } else if (type === 'D3_thamom') {
    templateFileName = '[D3] PHIEU CHI TIEN THAMOM.docx';
    outputDir = DEXUATCHI_D3_DIR;
    outputFileNameTemplate = '[D3] PHIEU CHI TIEN THAMOM.docx';
    category = 'D3';
  } else if (type === 'D3_daihoidang') {
    templateFileName = '[D3] PHIEU CHI TIEN DAIHOIDANG.docx';
    outputDir = DEXUATCHI_D3_DIR;
    outputFileNameTemplate = '[D3] PHIEU CHI TIEN DAIHOIDANG.docx';
    category = 'D3';
  } else if (type === 'PC09_hoinghi') {
    templateFileName = '[PC09] PHIEU CHI TIEN HOINGHI.docx';
    outputDir = DEXUATCHI_PC09_DIR;
    outputFileNameTemplate = '[PC09] PHIEU CHI TIEN HOINGHI.docx';
    category = 'PC09';
  } else if (type === 'PC09_htxsnv') {
    templateFileName = '[PC09] PHIEU CHI TIEN HTXSNV.docx';
    outputDir = DEXUATCHI_PC09_DIR;
    outputFileNameTemplate = '[PC09] PHIEU CHI TIEN HTXSNV.docx';
    category = 'PC09';
  } else if (type === 'PC09_ketoan') {
    templateFileName = '[PC09] PHIEU CHI TIEN KETOAN.docx';
    outputDir = DEXUATCHI_PC09_DIR;
    outputFileNameTemplate = '[PC09] PHIEU CHI TIEN KETOAN.docx';
    category = 'PC09';
  } else if (type === 'PC09_thaymuc') {
    templateFileName = '[PC09] PHIEU CHI TIEN THAYMUC.docx';
    outputDir = DEXUATCHI_PC09_DIR;
    outputFileNameTemplate = '[PC09] PHIEU CHI TIEN THAYMUC.docx';
    category = 'PC09';
  }
  
  const templatePath = path.join(FILEMAU_DIR, templateFileName);
  const cleanDateStr = `${dd}-${mm}-${yyyy}`;
  const outputFileName = `${cleanDateStr} ${outputFileNameTemplate}`;
  const outputPath = path.join(outputDir, outputFileName);
  
  // 5. Generate Word File
  try {
    generateDocx(templatePath, outputPath, dataForTemplate);
  } catch (fileErr) {
    console.error('Lỗi sinh file Word, lưu bản ghi tạm:', fileErr);
  }
  
  // 6. Save expenditure record
  const EXPENDITURES_FILE = path.join(dbDir, 'expenditures.json');
  const expenditures = readJSON<any[]>(EXPENDITURES_FILE, []);
  const newExpenditure = {
    id: 'exp-' + Date.now(),
    type,
    category,
    date: dateFormatted, // DD/MM/YYYY
    rawDate: date, // YYYY-MM-DD
    amount: finalAmount,
    amountInWords,
    coSoCanCu,
    nguoiDeXuat,
    nguoiThamHoi,
    luongCoBan: luongCoBan ? Number(luongCoBan) : undefined,
    outputFilePath: outputPath,
    outputFileName: outputFileName,
    createdAt: new Date().toISOString()
  };
  
  expenditures.push(newExpenditure);
  writeJSON(EXPENDITURES_FILE, expenditures);
  
  res.json({ success: true, expenditure: newExpenditure });
});

// DELETE /api/expenditures/:id - Delete an expenditure
app.delete('/api/expenditures/:id', (req, res) => {
  const { id } = req.params;
  const EXPENDITURES_FILE = path.join(dbDir, 'expenditures.json');
  const expenditures = readJSON<any[]>(EXPENDITURES_FILE, []);
  
  const exp = expenditures.find(e => e.id === id);
  if (exp && exp.outputFilePath) {
    try {
      if (fs.existsSync(exp.outputFilePath)) {
        fs.unlinkSync(exp.outputFilePath);
        console.log(`Deleted physical file: ${exp.outputFilePath}`);
      }
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  }

  const filtered = expenditures.filter(e => e.id !== id);
  writeJSON(EXPENDITURES_FILE, filtered);
  res.json({ success: true });
});

// GET /api/expenditures/download/:id - Download generated Word file
app.get('/api/expenditures/download/:id', (req, res) => {
  const { id } = req.params;
  const EXPENDITURES_FILE = path.join(dbDir, 'expenditures.json');
  const expenditures = readJSON<any[]>(EXPENDITURES_FILE, []);
  const exp = expenditures.find(e => e.id === id);
  if (!exp) {
    return res.status(404).json({ error: 'Không tìm thấy bản ghi chi' });
  }
  
  if (fs.existsSync(exp.outputFilePath)) {
    res.download(exp.outputFilePath, exp.outputFileName);
  } else {
    res.status(404).json({ error: 'Tệp tin không tồn tại trên hệ thống' });
  }
});

// GET /api/so-thu-chi/:month - Calculate Ledgers up to target month
app.get('/api/so-thu-chi/:month', (req, res) => {
  const { month } = req.params; // YYYY-MM
  const EXPENDITURES_FILE = path.join(dbDir, 'expenditures.json');
  const expenditures = readJSON<any[]>(EXPENDITURES_FILE, []);
  const reportInputs = readJSON<Record<string, any>>(REPORTS_INPUTS_FILE, {});
  
  const INITIAL_BALANCES_FILE = path.join(dbDir, 'initial_balances.json');
  const initBal = readJSON<any>(INITIAL_BALANCES_FILE, {
    ktpctp: 7050300,
    pc09: 22196910
  });

  const months = getMonthRange('2026-06', month);
  
  // 1. KTPCTP Ledger
  const ktpctpTransactions: any[] = [];
  
  for (const m of months) {
    const [yyyy, mm] = m.split('-');
    const results = computeMonthlyFees(m);
    const activeKTPCTPMembers = results.filter(r => r.chiBo === 'Kỹ thuật phòng chống tội phạm' && r.status === 'active');
    const h12_m = activeKTPCTPMembers.reduce((sum, r) => sum + r.dangPhi, 0);
    
    let ratio_m = 70;
    const historicalInput = reportInputs[m];
    if (historicalInput && historicalInput.capDoiRatios && historicalInput.capDoiRatios['Kỹ thuật phòng chống tội phạm'] !== undefined) {
      ratio_m = Number(historicalInput.capDoiRatios['Kỹ thuật phòng chống tội phạm']);
    }
    
    const h16_m = h12_m * (100 - ratio_m) / 100;
    
    ktpctpTransactions.push({
      date: `03/${mm}/${yyyy}`,
      rawDate: `${yyyy}-${mm}-03`,
      type: 'thu',
      noidung: `Thu Đảng phí Tháng ${mm}/${yyyy}`,
      sotienthu: h16_m,
      sotienchi: 0
    });
  }
  
  const d3Expenditures = expenditures.filter(e => e.category === 'D3');
  for (const exp of d3Expenditures) {
    let noidung = '';
    if (exp.type === 'D3_hoatdong') {
      noidung = `Chi hoạt động theo ${exp.coSoCanCu || ''}`;
    } else if (exp.type === 'D3_thamom') {
      noidung = `Chi thăm ốm đồng chí ${exp.nguoiThamHoi || ''}`;
    } else if (exp.type === 'D3_daihoidang') {
      noidung = `Chi Đại hội Đảng theo ${exp.coSoCanCu || ''}`;
    }
    
    ktpctpTransactions.push({
      id: exp.id,
      date: exp.date,
      rawDate: exp.rawDate,
      type: 'chi',
      noidung,
      sotienthu: 0,
      sotienchi: exp.amount,
      downloadUrl: `/api/expenditures/download/${exp.id}`
    });
  }
  
  ktpctpTransactions.sort((a, b) => {
    const dateComp = a.rawDate.localeCompare(b.rawDate);
    if (dateComp !== 0) return dateComp;
    return a.type === 'thu' ? -1 : 1;
  });
  
  let ktpctpBalance = initBal.ktpctp;
  const ktpctpLedger = ktpctpTransactions.map(t => {
    if (t.type === 'thu') {
      ktpctpBalance += t.sotienthu;
    } else {
      ktpctpBalance -= t.sotienchi;
    }
    return { ...t, tonquy: ktpctpBalance };
  });
  
  ktpctpLedger.unshift({
    date: '',
    rawDate: '2026-05-31',
    type: 'initial',
    noidung: 'Mốc số dư ban đầu',
    sotienthu: 0,
    sotienchi: 0,
    tonquy: initBal.ktpctp
  });
  
  // 2. PC09 Ledger
  const pc09Transactions: any[] = [];
  
  for (const m of months) {
    const [yyyy, mm] = m.split('-');
    
    let inp = { b: 0, d: 0, f: 0 };
    let ratioUp = 30;
    
    const hist = reportInputs[m];
    if (hist && hist.dangBoInputs) {
      inp = {
        b: Number(hist.dangBoInputs.b) || 0,
        d: Number(hist.dangBoInputs.d) || 0,
        f: Number(hist.dangBoInputs.f) || 0
      };
    } else {
      const mFees = computeMonthlyFees(m);
      const knhtTotal = mFees.filter(r => r.chiBo === 'Khám nghiệm hiện trường' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
      const gdTotal = mFees.filter(r => r.chiBo === 'Giám định' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
      const ktpctpTotal = mFees.filter(r => r.chiBo === 'Kỹ thuật phòng chống tội phạm' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
      
      let capDoiRatio_ktpctp = 70;
      if (hist && hist.capDoiRatios && hist.capDoiRatios['Kỹ thuật phòng chống tội phạm'] !== undefined) {
        capDoiRatio_ktpctp = Number(hist.capDoiRatios['Kỹ thuật phòng chống tội phạm']);
      }
      
      inp = {
        b: knhtTotal,
        d: gdTotal,
        f: ktpctpTotal * capDoiRatio_ktpctp / 100
      };
    }
    
    if (hist && hist.dangBoRatio !== undefined) {
      ratioUp = Number(hist.dangBoRatio);
    }
    
    const h12_m = inp.b + inp.d + inp.f;
    const h17_m = h12_m * (100 - ratioUp) / 100;
    
    pc09Transactions.push({
      date: `${mm}/${yyyy}`,
      rawDate: `${yyyy}-${mm}-03`,
      type: 'thu',
      noidung: `Thu Đảng phí Tháng ${mm}/${yyyy}`,
      sotienthu: h17_m,
      sotienchi: 0
    });
  }
  
  const pc09Expenditures = expenditures.filter(e => e.category === 'PC09');
  for (const exp of pc09Expenditures) {
    let noidung = '';
    const expYear = exp.date.split('/')[2] || '2026';
    if (exp.type === 'PC09_hoinghi') {
      noidung = `Chi tổ chức Hội nghị theo ${exp.coSoCanCu || ''}`;
    } else if (exp.type === 'PC09_htxsnv') {
      noidung = `Chi khen thưởng Đảng viên HTXSNV năm ${expYear}`;
    } else if (exp.type === 'PC09_ketoan') {
      noidung = `Chi Kế toán 6 tháng năm ${expYear}`;
    } else if (exp.type === 'PC09_thaymuc') {
      noidung = `Chi thay mực`;
    }
    
    pc09Transactions.push({
      id: exp.id,
      date: exp.date,
      rawDate: exp.rawDate,
      type: 'chi',
      noidung,
      sotienthu: 0,
      sotienchi: exp.amount,
      downloadUrl: `/api/expenditures/download/${exp.id}`
    });
  }
  
  pc09Transactions.sort((a, b) => {
    const dateComp = a.rawDate.localeCompare(b.rawDate);
    if (dateComp !== 0) return dateComp;
    return a.type === 'thu' ? -1 : 1;
  });
  
  let pc09Balance = initBal.pc09;
  const pc09Ledger = pc09Transactions.map(t => {
    if (t.type === 'thu') {
      pc09Balance += t.sotienthu;
    } else {
      pc09Balance -= t.sotienchi;
    }
    return { ...t, tonquy: pc09Balance };
  });
  
  pc09Ledger.unshift({
    date: '',
    rawDate: '2026-05-31',
    type: 'initial',
    noidung: 'Mốc số dư ban đầu',
    sotienthu: 0,
    sotienchi: 0,
    tonquy: initBal.pc09
  });
  
  res.json({
    ktpctpLedger,
    pc09Ledger
  });
});

// GET /api/initial-balances - Get initial starting balances
app.get('/api/initial-balances', (req, res) => {
  const INITIAL_BALANCES_FILE = path.join(dbDir, 'initial_balances.json');
  const balances = readJSON<any>(INITIAL_BALANCES_FILE, {
    ktpctp: 7050300,
    pc09: 22196910
  });
  res.json(balances);
});

// POST /api/initial-balances - Update initial starting balances
app.post('/api/initial-balances', (req, res) => {
  const { ktpctp, pc09 } = req.body;
  const INITIAL_BALANCES_FILE = path.join(dbDir, 'initial_balances.json');
  const balances = {
    ktpctp: Number(ktpctp) || 0,
    pc09: Number(pc09) || 0
  };
  writeJSON(INITIAL_BALANCES_FILE, balances);
  res.json({ success: true, balances });
});

// GET /api/data - Get all raw database values
app.get('/api/data', (req, res) => {
  const members = readJSON<Member[]>(MEMBERS_FILE, []);
  const changes = readJSON<ChangeDeclaration[]>(CHANGES_FILE, []);
  const disables = readJSON<DisableDeclaration[]>(DISABLES_FILE, []);
  const salaries = readJSON<BaseSalaryHistory[]>(SALARIES_FILE, []);
  const reportInputs = readJSON<Record<string, any>>(REPORTS_INPUTS_FILE, {});

  res.json({
    members,
    changes,
    disables,
    salaries,
    reportInputs
  });
});

// POST /api/members - Add a new member
app.post('/api/members', (req, res) => {
  const { name, joinDate, baseMonth, baseChiBo, baseHeSoLuong, baseHeSoChucVu } = req.body;
  if (!name || !joinDate || !baseMonth || !baseChiBo) {
    return res.status(400).json({ error: 'Thiếu trường thông tin bắt buộc' });
  }

  const members = readJSON<Member[]>(MEMBERS_FILE, []);
  const newMember: Member = {
    id: 'member-' + Date.now(),
    name,
    joinDate,
    baseMonth,
    baseChiBo,
    baseHeSoLuong: Number(baseHeSoLuong) || 0,
    baseHeSoChucVu: Number(baseHeSoChucVu) || 0
  };

  members.push(newMember);
  writeJSON(MEMBERS_FILE, members);
  res.json({ success: true, member: newMember });
});

// DELETE /api/members/:id - Delete a member entirely
app.delete('/api/members/:id', (req, res) => {
  const { id } = req.params;
  const members = readJSON<Member[]>(MEMBERS_FILE, []);
  const filtered = members.filter(m => m.id !== id);
  
  if (members.length === filtered.length) {
    return res.status(404).json({ error: 'Không tìm thấy Đảng viên' });
  }

  writeJSON(MEMBERS_FILE, filtered);

  // Clean up changes and disables for this member as well
  const changes = readJSON<ChangeDeclaration[]>(CHANGES_FILE, []);
  const disables = readJSON<DisableDeclaration[]>(DISABLES_FILE, []);
  
  writeJSON(CHANGES_FILE, changes.filter(c => c.memberId !== id));
  writeJSON(DISABLES_FILE, disables.filter(d => d.memberId !== id));

  res.json({ success: true });
});

// POST /api/changes - Add a change declaration (Khai báo thay đổi)
app.post('/api/changes', (req, res) => {
  const { memberId, memberName, field, newChiBo, newHeSoLuong, newHeSoChucVu, effectiveMonth } = req.body;
  if (!memberId || !effectiveMonth || !field) {
    return res.status(400).json({ error: 'Thiếu trường thông tin bắt buộc' });
  }

  const changes = readJSON<ChangeDeclaration[]>(CHANGES_FILE, []);
  const members = readJSON<Member[]>(MEMBERS_FILE, []);
  const member = members.find(m => m.id === memberId);
  if (!member) {
    return res.status(444).json({ error: 'Không tìm thấy Đảng viên' });
  }

  // To store changes properly, let's identify the OLD values as of the month BEFORE effectiveMonth
  // Or we can just store the new values as specified. Let's record the transition!
  // Resolve member state just before effectiveMonth to populate old values
  const dateParts = effectiveMonth.split('-');
  let prevYear = parseInt(dateParts[0], 10);
  let prevMonth = parseInt(dateParts[1], 10) - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  
  // Calculate active states before changes
  const beforeState = calculateMemberFee(member, changes, [], 2340000, prevMonthStr);

  const newChange: ChangeDeclaration = {
    id: 'change-' + Date.now(),
    memberId,
    memberName: memberName || member.name,
    field,
    oldChiBo: field === 'chiBo' || field === 'all' ? beforeState.chiBo : undefined,
    newChiBo: field === 'chiBo' || field === 'all' ? newChiBo : undefined,
    oldHeSoLuong: field === 'heSoLuong' || field === 'all' ? beforeState.heSoLuong : undefined,
    newHeSoLuong: field === 'heSoLuong' || field === 'all' ? Number(newHeSoLuong) : undefined,
    oldHeSoChucVu: field === 'heSoChucVu' || field === 'all' ? beforeState.heSoChucVu : undefined,
    newHeSoChucVu: field === 'heSoChucVu' || field === 'all' ? Number(newHeSoChucVu) : undefined,
    effectiveMonth,
    createdAt: new Date().toISOString()
  };

  changes.push(newChange);
  writeJSON(CHANGES_FILE, changes);
  res.json({ success: true, change: newChange });
});

// DELETE /api/changes/:id - Delete a change declaration
app.delete('/api/changes/:id', (req, res) => {
  const { id } = req.params;
  const changes = readJSON<ChangeDeclaration[]>(CHANGES_FILE, []);
  const filtered = changes.filter(c => c.id !== id);
  if (changes.length === filtered.length) {
    return res.status(404).json({ error: 'Không tìm thấy khai báo thay đổi này' });
  }
  writeJSON(CHANGES_FILE, filtered);
  res.json({ success: true });
});

// POST /api/disables - Disable a member (Vô hiệu hoá)
app.post('/api/disables', (req, res) => {
  const { memberId, type, startMonth, durationMonths, note } = req.body;
  if (!memberId || !type || !startMonth) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  }

  const members = readJSON<Member[]>(MEMBERS_FILE, []);
  const member = members.find(m => m.id === memberId);
  if (!member) {
    return res.status(404).json({ error: 'Không tìm thấy Đảng viên' });
  }

  const disables = readJSON<DisableDeclaration[]>(DISABLES_FILE, []);
  
  const newDisable: DisableDeclaration = {
    id: 'disable-' + Date.now(),
    memberId,
    memberName: member.name,
    type,
    startMonth,
    durationMonths: type === 'temporary' ? Number(durationMonths) : undefined,
    createdAt: new Date().toISOString()
  };

  disables.push(newDisable);
  writeJSON(DISABLES_FILE, disables);
  res.json({ success: true, disable: newDisable });
});

// POST /api/reactivate - Reactivate a disabled member
app.post('/api/reactivate', (req, res) => {
  const { memberId, reactivatedMonth } = req.body;
  if (!memberId || !reactivatedMonth) {
    return res.status(400).json({ error: 'Thiếu thông tin kích hoạt lại' });
  }

  const disables = readJSON<DisableDeclaration[]>(DISABLES_FILE, []);
  // Find the latest active disable record for this member that doesn't have reactivatedMonth
  const activeDisables = disables
    .filter(d => d.memberId === memberId && !d.reactivatedMonth)
    .sort((a, b) => b.startMonth.localeCompare(a.startMonth) || b.createdAt.localeCompare(a.createdAt));

  if (activeDisables.length === 0) {
    return res.status(400).json({ error: 'Đảng viên này hiện đang hoạt động bình thường' });
  }

  const targetDisable = disables.find(d => d.id === activeDisables[0].id);
  if (targetDisable) {
    targetDisable.reactivatedMonth = reactivatedMonth;
    writeJSON(DISABLES_FILE, disables);
    res.json({ success: true, disable: targetDisable });
  } else {
    res.status(500).json({ error: 'Lỗi tìm bản ghi' });
  }
});

// POST /api/base-salaries - Add/Update Base Salary (Cập nhật lương cơ bản)
app.post('/api/base-salaries', (req, res) => {
  const { amount, effectiveMonth } = req.body;
  if (!amount || !effectiveMonth) {
    return res.status(400).json({ error: 'Thiếu thông tin lương cơ bản' });
  }

  const salaries = readJSON<BaseSalaryHistory[]>(SALARIES_FILE, []);
  
  // Check if there's already an entry for this exact effectiveMonth, if so, update it.
  const existingIndex = salaries.findIndex(s => s.effectiveMonth === effectiveMonth);
  if (existingIndex !== -1) {
    salaries[existingIndex].amount = Number(amount);
    salaries[existingIndex].createdAt = new Date().toISOString();
  } else {
    salaries.push({
      id: 'lcb-' + Date.now(),
      amount: Number(amount),
      effectiveMonth,
      createdAt: new Date().toISOString()
    });
  }

  writeJSON(SALARIES_FILE, salaries);
  res.json({ success: true, salaries });
});

// POST /api/save-monthly-report-inputs - Save reporting parameters (ratios, inputs)
app.post('/api/save-monthly-report-inputs', (req, res) => {
  const { month, capDoiRatios, dangBoRatio, dangBoInputs } = req.body;
  if (!month) {
    return res.status(400).json({ error: 'Thiếu tháng báo cáo' });
  }

  const reportInputs = readJSON<Record<string, any>>(REPORTS_INPUTS_FILE, {});
  reportInputs[month] = {
    capDoiRatios: capDoiRatios || reportInputs[month]?.capDoiRatios || {},
    dangBoRatio: dangBoRatio !== undefined ? Number(dangBoRatio) : reportInputs[month]?.dangBoRatio,
    dangBoInputs: dangBoInputs || reportInputs[month]?.dangBoInputs || { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }
  };

  writeJSON(REPORTS_INPUTS_FILE, reportInputs);
  res.json({ success: true, data: reportInputs[month] });
});

// Helper: Calculate base salary for a specific month
function getBaseSalaryForMonth(salaries: BaseSalaryHistory[], monthStr: string): number {
  const applicableSalaries = salaries
    .filter(s => s.effectiveMonth <= monthStr)
    .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.createdAt.localeCompare(a.createdAt));
  
  if (applicableSalaries.length > 0) {
    return applicableSalaries[0].amount;
  }
  return 2340000; // default Vietnamese base salary fallback
}

// Helper: Get list of YYYY-MM from start to end (inclusive)
function getMonthRange(startStr: string, endStr: string): string[] {
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

// Helper to compute all calculations for a target month
function computeMonthlyFees(targetMonth: string): MemberCalculationResult[] {
  const members = readJSON<Member[]>(MEMBERS_FILE, []);
  const changes = readJSON<ChangeDeclaration[]>(CHANGES_FILE, []);
  const disables = readJSON<DisableDeclaration[]>(DISABLES_FILE, []);
  const salaries = readJSON<BaseSalaryHistory[]>(SALARIES_FILE, []);

  const baseSalary = getBaseSalaryForMonth(salaries, targetMonth);

  return members.map(m => {
    // If the member's baseMonth is after the targetMonth, they do not exist yet in targetMonth calculations
    if (m.baseMonth > targetMonth) {
      return {
        memberId: m.id,
        name: m.name,
        joinDate: m.joinDate,
        chiBo: m.baseChiBo,
        heSoLuong: 0,
        heSoChucVu: 0,
        baseSalary: 0,
        tiengLuong: 0,
        seniorityYears: 0,
        tiengThamNien: 0,
        tongLuong: 0,
        dangPhi: 0,
        status: 'disabled' as const,
        note: 'Chưa vào Đảng'
      };
    }
    return calculateMemberFee(m, changes, disables, baseSalary, targetMonth);
  });
}

// GET /api/calculations/:month - Get calculations for a specific month
app.get('/api/calculations/:month', (req, res) => {
  const { month } = req.params;
  const results = computeMonthlyFees(month);
  res.json({ results });
});

// CUMULATIVE CALCULATION UTILITIES

// Cap Doi Cumulative Calculations (e.g. for KTPCTP)
function calculateCapDoiCumulative(monthStr: string, chiBo: ChiBoType, currentRatio: number) {
  const [currYear, currMonth] = monthStr.split('-').map(Number);
  const is2026 = currYear === 2026;
  
  // Baselines for June 2026 for KTPCTP
  const ktpctpH13_base = 10764000;
  const ktpctpH20_base = 4524400;
  const ktpctpH25_base = 6239600;

  let cumulativeH12 = 0;
  let cumulativeH16 = 0;
  let cumulativeH24 = 0;

  // Monthly reports inputs from file
  const reportInputs = readJSON<Record<string, any>>(REPORTS_INPUTS_FILE, {});

  // Determine starting month for accumulation
  // If year is 2026, start is 2026-06 (June 2026).
  // If year is 2027 or later, start is January of that year (YYYY-01).
  const startMonthStr = is2026 ? '2026-06' : `${currYear}-01`;
  const months = getMonthRange(startMonthStr, monthStr);

  for (const m of months) {
    // Get fee calculation for this month
    const results = computeMonthlyFees(m);
    const activeKTPCTPMembers = results.filter(r => r.chiBo === chiBo && r.status === 'active');
    
    // H12 for month m
    const h12_m = activeKTPCTPMembers.reduce((sum, r) => sum + r.dangPhi, 0);
    
    // Ratio for month m
    let ratio_m = currentRatio;
    if (m !== monthStr) {
      // Find historical ratio if stored
      const historicalInput = reportInputs[m];
      if (historicalInput && historicalInput.capDoiRatios && historicalInput.capDoiRatios[chiBo] !== undefined) {
        ratio_m = Number(historicalInput.capDoiRatios[chiBo]);
      }
    }
    
    // H16_m = (100 - ratio_m)% * H12_m
    const h16_m = h12_m * (100 - ratio_m) / 100;
    
    // H24_m = ratio_m% * H12_m
    const h24_m = h12_m * ratio_m / 100;

    cumulativeH12 += h12_m;
    cumulativeH16 += h16_m;
    cumulativeH24 += h24_m;
  }

  // Final outputs
  let finalH13 = cumulativeH12;
  let finalH20 = cumulativeH16;
  let finalH25 = cumulativeH24;

  if (is2026 && chiBo === 'Kỹ thuật phòng chống tội phạm') {
    finalH13 += ktpctpH13_base;
    finalH20 += ktpctpH20_base;
    finalH25 += ktpctpH25_base;
  }

  return {
    h13: finalH13,
    h20: finalH20,
    h25: finalH25
  };
}

// Toàn Đảng bộ Cumulative Calculations
function calculateDangBoCumulative(monthStr: string, currentRatioUp: number, currentInputs: { a: number; b: number; c: number; d: number; e: number; f: number }) {
  const [currYear, currMonth] = monthStr.split('-').map(Number);
  const is2026 = currYear === 2026;

  // Baselines for June 2026
  const h13_base = 26100800;
  const h20_base = 18893200;
  const h21_base = 18270560;
  const h25_base = 7830240;

  let cumulativeH12 = 0; // Sum of b + d + f
  let cumulativeH16 = 0; // Sum of a + c + e
  let cumulativeH17 = 0; // Sum of H12 * (100-ratio_up)%
  let cumulativeH24 = 0; // Sum of H12 * ratio_up%

  const reportInputs = readJSON<Record<string, any>>(REPORTS_INPUTS_FILE, {});

  const startMonthStr = is2026 ? '2026-06' : `${currYear}-01`;
  const months = getMonthRange(startMonthStr, monthStr);

  for (const m of months) {
    let inp = currentInputs;
    let ratioUp = currentRatioUp;

    // Load historical inputs if available and it is a past month
    if (m !== monthStr) {
      const hist = reportInputs[m];
      if (hist && hist.dangBoInputs) {
        inp = hist.dangBoInputs;
      } else {
        // If no past input saved, auto-calculate defaults based on fees in month m
        const mFees = computeMonthlyFees(m);
        const knhtTotal = mFees.filter(r => r.chiBo === 'Khám nghiệm hiện trường' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
        const gdTotal = mFees.filter(r => r.chiBo === 'Giám định' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
        const ktpctpTotal = mFees.filter(r => r.chiBo === 'Kỹ thuật phòng chống tội phạm' && r.status === 'active').reduce((sum, r) => sum + r.dangPhi, 0);
        
        // Find cap doi ratio
        let capDoiRatio_ktpctp = 70;
        if (hist && hist.capDoiRatios && hist.capDoiRatios['Kỹ thuật phòng chống tội phạm'] !== undefined) {
          capDoiRatio_ktpctp = hist.capDoiRatios['Kỹ thuật phòng chống tội phạm'];
        }

        inp = {
          a: knhtTotal, // default collected
          b: knhtTotal, // default paid up
          c: gdTotal,
          d: gdTotal,
          e: ktpctpTotal,
          f: ktpctpTotal * capDoiRatio_ktpctp / 100 // default paid based on team ratio
        };
      }

      if (hist && hist.dangBoRatio !== undefined) {
        ratioUp = hist.dangBoRatio;
      }
    }

    const h12_m = inp.b + inp.d + inp.f;
    const h16_m = inp.a + inp.c + inp.e;
    const h17_m = h12_m * (100 - ratioUp) / 100;
    const h24_m = h12_m * ratioUp / 100;

    cumulativeH12 += h12_m;
    cumulativeH16 += h16_m;
    cumulativeH17 += h17_m;
    cumulativeH24 += h24_m;
  }

  let finalH13 = cumulativeH12;
  let finalH20 = cumulativeH16;
  let finalH21 = cumulativeH17;
  let finalH25 = cumulativeH24;

  if (is2026) {
    finalH13 += h13_base;
    finalH20 += h20_base;
    finalH21 += h21_base;
    finalH25 += h25_base;
  }

  return {
    h13: finalH13,
    h20: finalH20,
    h21: finalH21,
    h25: finalH25
  };
}

// POST /api/report/cap-doi - Generate Excel report for a Team
app.post('/api/report/cap-doi', async (req, res) => {
  const { month, chiBo, ratio } = req.body;
  if (!month || !chiBo || ratio === undefined) {
    return res.status(400).json({ error: 'Thiếu thông tin tạo báo cáo' });
  }

  const numericRatio = Number(ratio);
  const results = computeMonthlyFees(month);
  const teamMembers = results.filter(r => r.chiBo === chiBo && r.status === 'active');
  const totalCount = teamMembers.length;
  const totalDangPhi = teamMembers.reduce((sum, r) => sum + r.dangPhi, 0);

  // Compute cumulative values
  const cumulative = calculateCapDoiCumulative(month, chiBo, numericRatio);

  const h10Val = totalCount;
  const h12Val = totalDangPhi;
  const h13Val = cumulative.h13;
  const h16Val = h12Val * (100 - numericRatio) / 100;
  const h20Val = cumulative.h20;
  const h24Val = h12Val * numericRatio / 100;
  const h25Val = cumulative.h25;

  // Let's format folder name and target filename
  // For KTPCTP -> folder "BaoCao_KTPCTP", file "BaoCao_KTPCTP_ThangMM-YYYY.xlsx"
  // For others, let's map appropriately
  let teamCode = 'KTPCTP';
  if (chiBo === 'Khám nghiệm hiện trường') teamCode = 'KNHT';
  if (chiBo === 'Giám định') teamCode = 'GD';

  const folderName = `BaoCao_${teamCode}`;
  const targetFolder = path.join(dbDir, folderName);
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const [year, mStr] = month.split('-');
  const fileName = `BaoCao_${teamCode}_Thang${mStr}-${year}.xlsx`;
  const outPath = path.join(targetFolder, fileName);

  const workbook = new ExcelJS.Workbook();
  const templateName = `Mau_BaoCao_CapDoi_${teamCode}.xlsx`;
  const generalTemplateName = `Mau_BaoCao_CapDoi.xlsx`;
  const templatePath = fs.existsSync(path.join(dbDir, templateName)) 
    ? path.join(dbDir, templateName) 
    : path.join(dbDir, generalTemplateName);

  let sheet: ExcelJS.Worksheet;

  if (fs.existsSync(templatePath)) {
    try {
      await workbook.xlsx.readFile(templatePath);
      sheet = workbook.worksheets[0];
    } catch (err) {
      console.error('Error reading template, creating from scratch', err);
      sheet = workbook.addWorksheet('Báo cáo thu nộp Đảng phí');
    }
  } else {
    sheet = workbook.addWorksheet('Báo cáo thu nộp Đảng phí');
  }

  // Ensure worksheet is styled and filled correctly
  // Write headers if creating from scratch
  if (!fs.existsSync(templatePath)) {
    sheet.getColumn('G').width = 45;
    sheet.getColumn('H').width = 25;

    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = `BÁO CÁO THU, NỘP ĐẢNG PHÍ CẤP ĐỘI - CHI BỘ ${chiBo.toUpperCase()}`;
    sheet.getCell('A1').font = { name: 'Times New Roman', size: 14, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value = `Tháng ${mStr} Năm ${year}`;
    sheet.getCell('A2').font = { name: 'Times New Roman', size: 12, italic: true };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // Fill details
    sheet.getCell('G10').value = 'Số lượng Đảng viên đóng đảng phí trong tháng:';
    sheet.getCell('G12').value = 'Tổng số tiền đảng phí phải đóng trong tháng:';
    sheet.getCell('G13').value = 'Tổng lũy kế đảng phí phải đóng (tính từ tháng 6):';
    sheet.getCell('G16').value = `Tiền đảng phí giữ lại chi bộ (${100 - numericRatio}%):`;
    sheet.getCell('G20').value = 'Lũy kế tiền đảng phí giữ lại chi bộ:';
    sheet.getCell('G24').value = `Tiền đảng phí nộp lên cấp trên (${numericRatio}%):`;
    sheet.getCell('G25').value = 'Lũy kế tiền đảng phí nộp lên cấp trên:';

    const fontNormal = { name: 'Times New Roman', size: 11 };
    const fontBold = { name: 'Times New Roman', size: 11, bold: true };
    const borderThin = {
      top: { style: 'thin' as const },
      left: { style: 'thin' as const },
      bottom: { style: 'thin' as const },
      right: { style: 'thin' as const }
    };

    ['G10', 'G12', 'G13', 'G16', 'G20', 'G24', 'G25'].forEach(cellRef => {
      const c = sheet.getCell(cellRef);
      c.font = fontNormal;
      c.border = borderThin;
    });
  }

  // Write calculated numbers into specified cells
  sheet.getCell('H10').value = h10Val;
  sheet.getCell('H12').value = h12Val;
  sheet.getCell('H13').value = h13Val;
  sheet.getCell('H16').value = h16Val;
  sheet.getCell('H20').value = h20Val;
  sheet.getCell('H24').value = h24Val;
  sheet.getCell('H25').value = h25Val;

  // Apply number formats
  ['H12', 'H13', 'H16', 'H20', 'H24', 'H25'].forEach(cellRef => {
    const cell = sheet.getCell(cellRef);
    cell.numFmt = '#,##0';
    cell.font = { name: 'Times New Roman', size: 11, bold: true };
    cell.alignment = { horizontal: 'right' };
  });
  sheet.getCell('H10').numFmt = '#,##0';
  sheet.getCell('H10').font = { name: 'Times New Roman', size: 11, bold: true };
  sheet.getCell('H10').alignment = { horizontal: 'right' };

  // Save on filesystem
  await workbook.xlsx.writeFile(outPath);
  console.log(`Saved report on filesystem to: ${outPath}`);

  // Send to browser
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(fileName)}`);
  
  await workbook.xlsx.write(res);
  res.end();
});

// POST /api/report/dang-bo - Generate Excel report for Entire Party Committee
app.post('/api/report/dang-bo', async (req, res) => {
  const { month, ratioUp, a, b, c, d, e, f } = req.body;
  if (!month || ratioUp === undefined) {
    return res.status(400).json({ error: 'Thiếu thông tin lập báo cáo' });
  }

  const numericRatioUp = Number(ratioUp);
  const valA = Number(a) || 0;
  const valB = Number(b) || 0;
  const valC = Number(c) || 0;
  const valD = Number(d) || 0;
  const valE = Number(e) || 0;
  const valF = Number(f) || 0;

  const results = computeMonthlyFees(month);
  const activeMembers = results.filter(r => r.status === 'active');
  const totalCount = activeMembers.length;

  const h10Val = totalCount;
  const h12Val = valB + valD + valF;
  const h16Val = valA + valC + valE;
  const h17Val = h12Val * (100 - numericRatioUp) / 100;
  const h24Val = h12Val * numericRatioUp / 100;

  // Compute cumulative values
  const currentInputs = { a: valA, b: valB, c: valC, d: valD, e: valE, f: valF };
  const cumulative = calculateDangBoCumulative(month, numericRatioUp, currentInputs);

  const h13Val = cumulative.h13;
  const h20Val = cumulative.h20;
  const h21Val = cumulative.h21;
  const h25Val = cumulative.h25;

  const folderName = `BaoCao_DangBo`;
  const targetFolder = path.join(dbDir, folderName);
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const [year, mStr] = month.split('-');
  const fileName = `BaoCao_DangBo_Thang${mStr}-${year}.xlsx`;
  const outPath = path.join(targetFolder, fileName);

  const workbook = new ExcelJS.Workbook();
  const templatePath = path.join(dbDir, 'Mau_BaoCao_ToanDangBo.xlsx');
  let sheet: ExcelJS.Worksheet;

  if (fs.existsSync(templatePath)) {
    try {
      await workbook.xlsx.readFile(templatePath);
      sheet = workbook.worksheets[0];
    } catch (err) {
      console.error('Error reading template, creating from scratch', err);
      sheet = workbook.addWorksheet('Báo cáo thu nộp Đảng bộ');
    }
  } else {
    sheet = workbook.addWorksheet('Báo cáo thu nộp Đảng bộ');
  }

  if (!fs.existsSync(templatePath)) {
    sheet.getColumn('G').width = 45;
    sheet.getColumn('H').width = 25;

    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = `BÁO CÁO THU, NỘP ĐẢNG PHÍ TOÀN ĐẢNG BỘ`;
    sheet.getCell('A1').font = { name: 'Times New Roman', size: 14, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value = `Tháng ${mStr} Năm ${year}`;
    sheet.getCell('A2').font = { name: 'Times New Roman', size: 12, italic: true };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // Fill details
    sheet.getCell('G10').value = 'Đếm toàn bộ số đảng viên cả đơn vị:';
    sheet.getCell('G12').value = 'Tổng số tiền nộp lên Đảng bộ (b + d + f):';
    sheet.getCell('G13').value = 'Lũy kế tiền nộp lên Đảng bộ (từ tháng 6):';
    sheet.getCell('G16').value = 'Tổng số tiền thu của đảng viên (a + c + e):';
    sheet.getCell('G17').value = `Đảng phí giữ lại Đảng bộ (${100 - numericRatioUp}%):`;
    sheet.getCell('G20').value = 'Lũy kế tiền thu từ đảng viên:';
    sheet.getCell('G21').value = 'Lũy kế tiền giữ lại Đảng bộ:';
    sheet.getCell('G24').value = `Đảng phí nộp lên ĐUCAT (${numericRatioUp}%):`;
    sheet.getCell('G25').value = 'Lũy kế tiền nộp lên ĐUCAT:';

    const fontNormal = { name: 'Times New Roman', size: 11 };
    const borderThin = {
      top: { style: 'thin' as const },
      left: { style: 'thin' as const },
      bottom: { style: 'thin' as const },
      right: { style: 'thin' as const }
    };

    ['G10', 'G12', 'G13', 'G16', 'G17', 'G20', 'G21', 'G24', 'G25'].forEach(cellRef => {
      const c = sheet.getCell(cellRef);
      c.font = fontNormal;
      c.border = borderThin;
    });
  }

  // Write values to cells
  sheet.getCell('H10').value = h10Val;
  sheet.getCell('H12').value = h12Val;
  sheet.getCell('H13').value = h13Val;
  sheet.getCell('H16').value = h16Val;
  sheet.getCell('H17').value = h17Val;
  sheet.getCell('H20').value = h20Val;
  sheet.getCell('H21').value = h21Val;
  sheet.getCell('H24').value = h24Val;
  sheet.getCell('H25').value = h25Val;

  // Format values
  ['H12', 'H13', 'H16', 'H17', 'H20', 'H21', 'H24', 'H25'].forEach(cellRef => {
    const cell = sheet.getCell(cellRef);
    cell.numFmt = '#,##0';
    cell.font = { name: 'Times New Roman', size: 11, bold: true };
    cell.alignment = { horizontal: 'right' };
  });
  sheet.getCell('H10').numFmt = '#,##0';
  sheet.getCell('H10').font = { name: 'Times New Roman', size: 11, bold: true };
  sheet.getCell('H10').alignment = { horizontal: 'right' };

  // Save on filesystem
  await workbook.xlsx.writeFile(outPath);
  console.log(`Saved report on filesystem to: ${outPath}`);

  // Send to browser
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(fileName)}`);
  
  await workbook.xlsx.write(res);
  res.end();
});

// POST /api/upload-template - Allow users to upload their Excel templates
// (Simply accept binary or base64 and write to the database folder)
app.post('/api/upload-template', (req, res) => {
  const { name, base64Content } = req.body;
  if (!name || !base64Content) {
    return res.status(400).json({ error: 'Thiếu tên tệp hoặc dữ liệu' });
  }

  try {
    const buffer = Buffer.from(base64Content, 'base64');
    const destPath = path.join(dbDir, name);
    fs.writeFileSync(destPath, buffer);
    console.log(`Template saved successfully to: ${destPath}`);
    res.json({ success: true, path: destPath });
  } catch (err) {
    console.error('Error saving template', err);
    res.status(500).json({ error: 'Không thể lưu mẫu báo cáo' });
  }
});

// Vite middleware and static serving
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.DIST_PATH || path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

start();
