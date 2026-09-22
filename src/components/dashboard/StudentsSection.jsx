import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Pencil, Repeat, Trash2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { studentsApi } from '@/services/studentsApi';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';
import useRewardUnits from '@/hooks/useRewardUnits';
import { generateThreeDigitLoginNumber as generateLoginNumber } from '../../../shared/login-numbers.js';

const emptyStudent = {
  name: '',
  loginNumber: '',
  nationalId: '',
  guardianPhone: '',
  committeeId: '',
  points: 0,
  pointReason: '',
};

const normalizeCell = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeKey = (value) =>
  normalizeCell(value)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replaceAll('ؤ', 'و')
    .replaceAll('ئ', 'ي')
    .replaceAll('ة', 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, '');

const toEnglishDigits = (value) =>
  normalizeCell(value).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicIndex = arabicDigits.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    return String(persianDigits.indexOf(digit));
  });

const toDigits = (value) => toEnglishDigits(value).replace(/[^\d]/g, '');
const normalizeLoginNumber = (value) => {
  const digits = toDigits(value);
  return /^\d{3}$/.test(digits) ? digits : '';
};

const normalizePhone = (value) => {
  const digits = toDigits(value);
  if (!digits) return '';
  if (digits.startsWith('9665') && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.startsWith('05')) return digits;
  if (digits.startsWith('5') && digits.length === 9) return `0${digits}`;
  return digits;
};

const toNamePart = (value) =>
  toEnglishDigits(value)
    .replace(/[0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const headerAliases = {
  name: ['اسم', 'الاسم', 'اسمالطالب', 'الطالب', 'student', 'studentname', 'name'],
  phone: ['جوال', 'الجوال', 'جوالوليالامر', 'رقمجوالوليالامر', 'هاتف', 'الهاتف', 'phone', 'mobile', 'guardianphone'],
  nationalId: ['identity', 'nationalid', 'id', '\u0647\u0648\u064a\u0629', '\u0627\u0644\u0647\u0648\u064a\u0629', '\u0631\u0642\u0645\u0627\u0644\u0647\u0648\u064a\u0629'],
  loginNumber: ['رقمالدخول', 'دخول', 'login', 'loginnumber'],
  committee: ['اسرة', 'الاسرة', 'حلقة', 'الحلقة', 'العائلة', 'family', 'committee'],
};

const findHeaderMapping = (rows) => {
  const maxHeaderRows = Math.min(rows.length, 8);
  for (let rowIndex = 0; rowIndex < maxHeaderRows; rowIndex += 1) {
    const mapping = {};
    (rows[rowIndex] || []).forEach((cell, cellIndex) => {
      const key = normalizeKey(cell);
      Object.entries(headerAliases).forEach(([field, aliases]) => {
        if (mapping[field] !== undefined) return;
        if (aliases.some((alias) => key.includes(normalizeKey(alias)))) {
          mapping[field] = cellIndex;
        }
      });
    });
    if (mapping.name !== undefined) {
      return { mapping, startIndex: rowIndex + 1 };
    }
  }

  return {
    mapping: { name: 0, phone: 1, nationalId: 2 },
    startIndex: 0,
  };
};

const parseStudentRows = (rows, usedLoginNumbers, committees = []) => {
  const safeRows = rows.filter(Array.isArray).filter((row) => row.some((cell) => normalizeCell(cell)));
  const committeeByName = new Map(
    committees.map((committee) => [normalizeKey(committee.name), String(committee.id)])
  );
  const { mapping, startIndex } = findHeaderMapping(safeRows);

  return safeRows
    .slice(startIndex)
    .map((row, index) => {
      const name = toNamePart(row[mapping.name]);
      const phone = mapping.phone === undefined ? '' : normalizePhone(row[mapping.phone]);
      const nationalId = mapping.nationalId === undefined ? '' : toDigits(row[mapping.nationalId]);
      const loginFromFile = mapping.loginNumber === undefined ? '' : normalizeLoginNumber(row[mapping.loginNumber]);
      const committeeFromFile = mapping.committee === undefined
        ? ''
        : committeeByName.get(normalizeKey(row[mapping.committee])) || '';
      const rowText = row.map(normalizeCell).join(' ');

      if (/اسم|طالب|جوال|ولي|هاتف|رقم|هوية/i.test(rowText) && !name) return null;
      if (!name) return null;

      const loginNumber = loginFromFile && !usedLoginNumbers.has(loginFromFile)
        ? loginFromFile
        : generateLoginNumber(usedLoginNumbers);
      if (loginNumber) usedLoginNumbers.add(loginNumber);

      return {
        rowId: `${Date.now()}-${startIndex + index}`,
        name,
        loginNumber,
        nationalId,
        guardianPhone: phone,
        committeeId: committeeFromFile,
      };
    })
    .filter(Boolean);
};

const detectCsvDelimiter = (text) => {
  const sample = text.split(/\r?\n/).find((line) => line.trim()) || '';
  const candidates = [',', ';', '\t'];
  return candidates.reduce((best, delimiter) => {
    const count = sample.split(delimiter).length;
    return count > best.count ? { delimiter, count } : best;
  }, { delimiter: ',', count: 0 }).delimiter;
};

const parseCsvRows = (text) => {
  const delimiter = detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((csvRow) => csvRow.some((value) => normalizeCell(value)));
};

const readSpreadsheetSheets = async (file) => {
  const fileName = String(file.name || '').toLowerCase();

  if (fileName.endsWith('.csv') || file.type === 'text/csv') {
    return [{ name: 'CSV', rows: parseCsvRows(await file.text()) }];
  }

  if (fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
    throw new Error('صيغة .xls القديمة غير مدعومة. احفظ الملف بصيغة .xlsx أو CSV ثم ارفعه.');
  }

  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  if (Array.isArray(sheets) && sheets[0]?.data) {
    return sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data || [] }));
  }

  return [{ name: 'Sheet1', rows: Array.isArray(sheets) ? sheets : [] }];
};

const parseBestStudentSheet = (sheets, usedLoginNumbers, committees) => {
  let best = { parsed: [], sheetName: '' };

  sheets.forEach((sheet) => {
    const candidateUsedNumbers = new Set(usedLoginNumbers);
    const parsed = parseStudentRows(sheet.rows || [], candidateUsedNumbers, committees);
    if (parsed.length > best.parsed.length) {
      best = { parsed, sheetName: sheet.name || '' };
    }
  });

  best.parsed.forEach((student) => {
    if (student.loginNumber) usedLoginNumbers.add(student.loginNumber);
  });

  return best;
};


const StudentsSection = () => {
  const isOnline = useOnlineStatus();
  const accountId = Number(localStorage.getItem('wajeh_account_id') || localStorage.getItem('wajeh_supervisor_id') || 0);
  const actorRole = localStorage.getItem('wajeh_role') || 'manager';
  const rewardUnits = useRewardUnits();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [committees, setCommittees] = useState([]);
  const [students, setStudents] = useState([]);
  const [committeeFilter, setCommitteeFilter] = useState('all');
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [moveCommitteeId, setMoveCommitteeId] = useState('');
  const [dialog, setDialog] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bulkStudents, setBulkStudents] = useState([]);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const selectedCommitteeName = useMemo(() => {
    return committees.find((committee) => String(committee.id) === String(moveCommitteeId))?.name || '';
  }, [committees, moveCommitteeId]);

  const loadCommittees = async () => {
    const data = await loadOfflineSnapshot(accountId, 'management:committees', () => studentsApi.getCommittees(), { actorRole });
    setCommittees(data);
  };

  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await loadOfflineSnapshot(
        accountId,
        `management:students:${committeeFilter}`,
        () => studentsApi.getStudents({ committeeId: committeeFilter }),
        { actorRole },
      );
      setStudents(data);
    } finally {
      setIsLoading(false);
    }
  }, [accountId, actorRole, committeeFilter]);

  useEffect(() => {
    loadCommittees().catch((error) => {
      toast({ title: "تعذر تحميل الحلقات", description: error.message, variant: 'destructive' });
    });
  }, [toast]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadStudents().catch((error) => {
        toast({ title: "تعذر تحميل الطلاب", description: error.message, variant: 'destructive' });
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadStudents, toast]);

  const resetForm = () => {
    setStudentForm(emptyStudent);
    setSelectedStudent(null);
    setBulkStudents([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openAddDialog = () => {
    resetForm();
    setDialog('add');
  };

  const openEditDialog = (student) => {
    setSelectedStudent(student);
    setStudentForm({
      name: student.name,
      loginNumber: student.loginNumber,
      nationalId: student.nationalId || '',
      guardianPhone: student.guardianPhone,
      committeeId: student.committeeId ? String(student.committeeId) : '',
      points: Number(student.points || 0),
      pointReason: '',
    });
    setDialog('edit');
  };

  const saveStudent = async () => {
    if (dialog === 'add' && bulkStudents.length > 0) {
      await saveBulkStudents();
      return;
    }

    if (!studentForm.committeeId) {
      toast({ title: 'الحلقة مطلوبة', description: 'اختر حلقة للطالب قبل الحفظ.', variant: 'destructive' });
      return;
    }

    try {
      if (dialog === 'edit' && selectedStudent) {
        await studentsApi.updateStudent(selectedStudent.id, studentForm);
        toast({ title: "تم التحديث", description: "تم تحديث بيانات الطالب." });
      } else {
        await studentsApi.createStudent(studentForm);
        toast({ title: "تم الحفظ", description: "تمت إضافة الطالب وربطه بالحلقة." });
      }
      setDialog(null);
      resetForm();
      await loadStudents();
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error.message, variant: 'destructive' });
    }
  };

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const sheets = await readSpreadsheetSheets(file);
      const allStudents = await studentsApi.getStudents({ committeeId: 'all', search: '' }).catch(() => students);
      const usedLoginNumbers = new Set(allStudents.map((student) => String(student.loginNumber)));
      const { parsed } = parseBestStudentSheet(sheets, usedLoginNumbers, committees);

      if (!parsed.length) {
        toast({ title: 'لم يتم العثور على طلاب', description: 'تأكد من وجود عمود الاسم، أو ضع الاسم في العمود A.', variant: 'destructive' });
        return;
      }

      setBulkStudents(parsed);
      toast({ title: 'تم قراءة الملف', description: `تم استخراج ${parsed.length} طالب.` });
    } catch (error) {
      toast({ title: 'تعذر قراءة ملف Excel', description: `${error.message} - تأكد أن الملف بصيغة .xlsx وليس .xls.`, variant: 'destructive' });
    } finally {
      event.target.value = '';
    }
  };

  const updateBulkStudent = (rowId, field, value) => {
    setBulkStudents((current) =>
      current.map((student) => student.rowId === rowId ? { ...student, [field]: value } : student)
    );
  };

  const removeBulkStudent = (rowId) => {
    setBulkStudents((current) => current.filter((student) => student.rowId !== rowId));
  };

  const saveBulkStudents = async () => {
    const invalid = bulkStudents.some((student) =>
      !student.name.trim() || !String(student.loginNumber).trim() || !student.committeeId
    );

    if (invalid) {
      toast({ title: 'بيانات ناقصة', description: 'تأكد من الاسم ورقم الدخول والحلقة لكل طالب.', variant: 'destructive' });
      return;
    }

    setIsBulkSaving(true);
    try {
      const payload = bulkStudents.map(({ rowId: _rowId, ...student }) => student);
      const result = await studentsApi.createStudentsBulk(payload);
      toast({ title: 'تم الحفظ', description: `تمت إضافة ${result.count || payload.length} طالب.` });
      setDialog(null);
      resetForm();
      await loadStudents();
    } catch (error) {
      toast({ title: 'تعذر حفظ الطلاب', description: error.message, variant: 'destructive' });
    } finally {
      setIsBulkSaving(false);
    }
  };

  const confirmDelete = (student) => {
    setSelectedStudent(student);
    setDialog('delete');
  };

  const deleteStudent = async () => {
    if (!selectedStudent) return;
    try {
      await studentsApi.deleteStudent(selectedStudent.id);
      toast({ title: "تم الحذف", description: "تم حذف الطالب." });
      setDialog(null);
      setSelectedStudent(null);
      await loadStudents();
    } catch (error) {
      toast({ title: "تعذر الحذف", description: error.message, variant: 'destructive' });
    }
  };

  const openMoveDialog = (student) => {
    setSelectedStudent(student);
    setMoveCommitteeId(student.committeeId ? String(student.committeeId) : '');
    setDialog('move');
  };

  const moveStudent = async () => {
    if (!selectedStudent) return;
    if (!moveCommitteeId) {
      toast({ title: 'الحلقة مطلوبة', description: 'اختر حلقة لنقل الطالب إليها.', variant: 'destructive' });
      return;
    }
    try {
      await studentsApi.moveStudent(selectedStudent.id, moveCommitteeId);
      toast({ title: "تم النقل", description: `تم نقل الطالب إلى ${selectedCommitteeName}.` });
      setDialog(null);
      setSelectedStudent(null);
      await loadStudents();
    } catch (error) {
      toast({ title: "تعذر النقل", description: error.message, variant: 'destructive' });
    }
  };

  const _resolveStudentsSection = () => {
    if (isLoading) {
      return <DashboardLoader />;
    }
    if (students.length === 0) {
      return <div className="rounded-xl border border-dashed border-primary/20 py-12 text-center text-muted-foreground">
              لا يوجد طلاب حالياً.
            </div>;
    }
    return <div className="space-y-3">
              {students.map((student) =>
            <div
              key={student.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-primary/20 bg-background p-4">
              
                  <div className="min-w-0">
                    <Button
                  variant="link"
                  onClick={() => isOnline && openEditDialog(student)}
                  disabled={!isOnline}
                  className="h-auto p-0 text-lg font-bold text-primary">
                  
                      {student.name}
                    </Button>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {student.committeeName || 'بدون حلقة'}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ManagementIconButton disabled={!isOnline} onClick={() => openEditDialog(student)} title="تعديل الطالب" aria-label={`تعديل ${student.name}`} tone="primary">
                      <Pencil className="h-4 w-4" />
                    </ManagementIconButton>
                    <Button variant="outline" size="icon" disabled={!isOnline} onClick={() => openMoveDialog(student)} title="نقل الطالب">
                      <Repeat className="h-4 w-4" />
                    </Button>
                    <ManagementIconButton disabled={!isOnline} onClick={() => confirmDelete(student)} title="الحذف" aria-label={`حذف ${student.name}`} tone="destructive">
                      <Trash2 className="h-4 w-4" />
                    </ManagementIconButton>
                  </div>
                </div>
            )}
            </div>;
  };
  return (
    <div className="space-y-6">
      {!isOnline ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center text-sm font-black text-amber-700">عرض محلي للقراءة فقط حتى عودة الاتصال.</div> : null}
      <Card className="bg-card border-primary/30 neon-glow">
        <CardHeader className="border-b border-primary/20 px-3 sm:px-6">
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
            <div className="min-w-0">
              <Select value={committeeFilter} onValueChange={setCommitteeFilter}>
                <SelectTrigger aria-label="اختر الحلقة" className="h-11 w-full min-w-0 bg-background border-primary/30 px-2 text-sm text-foreground">
                  <SelectValue placeholder="اختر الحلقة" />
                </SelectTrigger>
                <SelectContent className="bg-card border-primary/30 text-foreground">
                  <SelectItem value="all">كل الحلقات</SelectItem>
                  {committees.map((committee) =>
                  <SelectItem key={committee.id} value={String(committee.id)}>
                      {committee.name}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
              
              <Button onClick={openAddDialog} disabled={!isOnline} className="h-11 min-w-24 px-4 sm:min-w-[150px]">
                إضافة
              </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {_resolveStudentsSection()
          }
        </CardContent>
      </Card>

      <Dialog open={dialog === 'add' || dialog === 'edit'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className={`bg-card border-primary/30 text-foreground ${bulkStudents.length > 0 ? 'sm:max-w-5xl' : ''}`} dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">
              {dialog === 'edit' ? "تعديل بيانات الطالب" : "إضافة طالب"}
            </DialogTitle>
          </DialogHeader>
          {dialog === 'add' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-background/60 p-3">
              <div className="text-sm text-muted-foreground">
                ارفع ملف Excel بصيغة .xlsx: العمود A للاسم، والجوال والهوية اختياريان، ورقم الدخول يتولد تلقائيًا.
              </div>
              <Input
                aria-label="ملف الطلاب"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={handleExcelUpload}
                className="hidden"
              />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" />
                رفع ملف اكسيل
              </Button>
            </div>
          )}
          {dialog === 'add' && bulkStudents.length > 0 ? (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto py-4 pr-1">
              {bulkStudents.map((student, index) => (
                <div key={student.rowId} className="grid gap-3 rounded-2xl border border-primary/20 bg-background/70 p-3 lg:grid-cols-[44px_1.2fr_1fr_1fr_1fr_44px] lg:items-end">
                  <div className="flex h-10 items-center justify-center rounded-xl bg-primary/10 text-sm font-black text-primary">
                    {index + 1}
                  </div>
                  <div className="space-y-1">
                    <Label>الاسم</Label>
                    <Input aria-label={`اسم الطالب ${index + 1}`} value={student.name} onChange={(event) => updateBulkStudent(student.rowId, 'name', event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>رقم الجوال</Label>
                    <Input aria-label={`رقم جوال الطالب ${index + 1}`} value={student.guardianPhone} onChange={(event) => updateBulkStudent(student.rowId, 'guardianPhone', event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>رقم الهوية</Label>
                    <Input aria-label={`رقم هوية الطالب ${index + 1}`} value={student.nationalId} onChange={(event) => updateBulkStudent(student.rowId, 'nationalId', event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>الحلقة</Label>
                    <Select value={student.committeeId} onValueChange={(value) => updateBulkStudent(student.rowId, 'committeeId', value)}>
                      <SelectTrigger aria-label={`حلقة الطالب ${index + 1}`}>
                        <SelectValue placeholder="اختر الحلقة" />
                      </SelectTrigger>
                      <SelectContent>
                        {committees.map((committee) => (
                          <SelectItem key={committee.id} value={String(committee.id)}>
                            {committee.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ManagementIconButton onClick={() => removeBulkStudent(student.rowId)} tone="destructive" aria-label="حذف الطالب من القائمة">
                    <Trash2 className="h-4 w-4" />
                  </ManagementIconButton>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>اسم الطالب</Label>
                  <Input aria-label="اسم الطالب" value={studentForm.name} onChange={(event) => setStudentForm({ ...studentForm, name: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>رقم الهوية</Label>
                  <Input aria-label="رقم الهوية" value={studentForm.nationalId} onChange={(event) => setStudentForm({ ...studentForm, nationalId: event.target.value })} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>رقم الدخول</Label>
                  <Input aria-label="رقم الدخول" value={studentForm.loginNumber} onChange={(event) => setStudentForm({ ...studentForm, loginNumber: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>رقم الجوال</Label>
                  <Input aria-label="رقم الجوال" value={studentForm.guardianPhone} onChange={(event) => setStudentForm({ ...studentForm, guardianPhone: event.target.value })} />
                </div>
              </div>
              {dialog === 'edit' && (
                <>
                  <div className="space-y-2">
                    <Label>{rewardUnits.text('الكيلومترات')}</Label>
                    <Input
                      type="number"
                      aria-label={rewardUnits.text('الكيلومترات')}
                      min="0"
                      value={studentForm.points}
                      onChange={(event) => setStudentForm({ ...studentForm, points: Number(event.target.value || 0) })}
                    />
                  </div>
                  {Number(studentForm.points) !== Number(selectedStudent?.points || 0) && (
                    <div className="space-y-2">
                      <Label>{rewardUnits.text('سبب تعديل الكيلومترات')}</Label>
                      <Input
                        value={studentForm.pointReason}
                        aria-label={rewardUnits.text('سبب تعديل الكيلومترات')}
                        onChange={(event) => setStudentForm({ ...studentForm, pointReason: event.target.value })}
                        placeholder="اكتب سبب الزيادة أو الخصم"
                      />
                    </div>
                  )}
                </>
              )}
              <div className="space-y-2">
                <Label>الحلقة</Label>
                <Select value={studentForm.committeeId} onValueChange={(value) => setStudentForm({ ...studentForm, committeeId: value })}>
                  <SelectTrigger aria-label="حلقة الطالب">
                    <SelectValue placeholder="اختر الحلقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {committees.map((committee) =>
                    <SelectItem key={committee.id} value={String(committee.id)}>
                        {committee.name}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إغلاق</Button>
            <Button onClick={saveStudent} disabled={isBulkSaving}>{isBulkSaving ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'move'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">نقل الطالب</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>اسم الطالب</Label>
              <Input aria-label="اسم الطالب" value={selectedStudent?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>اختر الحلقة المراد نقل الطالب إليها</Label>
              <Select value={moveCommitteeId} onValueChange={setMoveCommitteeId}>
                <SelectTrigger aria-label="الحلقة المراد نقل الطالب إليها">
                  <SelectValue placeholder="اختر الحلقة" />
                </SelectTrigger>
                <SelectContent>
                  {committees.map((committee) =>
                  <SelectItem key={committee.id} value={String(committee.id)}>
                      {committee.name}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إغلاق</Button>
            <Button onClick={moveStudent}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-muted-foreground">
            هل تريد حذف الطالب {selectedStudent?.name}؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إغلاق</Button>
            <Button variant="destructive" onClick={deleteStudent}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);

};

export default StudentsSection;
