import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Save, Trash2, X } from 'lucide-react';
import { BASE_LETTERS } from './letterHiveData';

const emptyForm = { letter: BASE_LETTERS[0], question: '', answer: '' };

const LetterHiveQuestionBank = ({ questions, onAdd, onUpdate, onDelete, onClose }) => {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [activeLetter, setActiveLetter] = useState(BASE_LETTERS[0]);

  const activeQuestions = useMemo(() => questions[activeLetter] || [], [activeLetter, questions]);

  const submit = (event) => {
    event.preventDefault();
    const payload = {
      letter: form.letter,
      question: form.question.trim(),
      answer: form.answer.trim(),
    };

    if (!payload.question || !payload.answer) return;

    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onAdd(payload);
    }

    setActiveLetter(payload.letter);
    setEditingId(null);
    setForm({ ...emptyForm, letter: payload.letter });
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({ letter: item.letter, question: item.question, answer: item.answer });
    setActiveLetter(item.letter);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ ...emptyForm, letter: activeLetter });
  };

  return (
    <div className="letter-hive-bank-backdrop" onClick={onClose}>
      <section className="letter-hive-bank" onClick={(event) => event.stopPropagation()}>
        <header className="letter-hive-bank-header">
          <div>
            <p>مشترك في المنصة</p>
            <h2>بنك الأسئلة</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق">
            <X size={22} />
          </button>
        </header>

        <form className="letter-hive-bank-form" onSubmit={submit}>
          <label>
            الحرف
            <select value={form.letter} onChange={(event) => setForm((current) => ({ ...current, letter: event.target.value }))}>
              {BASE_LETTERS.map((letter) => (
                <option key={letter} value={letter}>{letter}</option>
              ))}
            </select>
          </label>
          <label>
            السؤال
            <textarea value={form.question} onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))} />
          </label>
          <label>
            الإجابة
            <input value={form.answer} onChange={(event) => setForm((current) => ({ ...current, answer: event.target.value }))} />
          </label>
          <div className="letter-hive-bank-actions">
            <button type="submit">
              {editingId ? <Save size={18} /> : <Plus size={18} />}
              {editingId ? 'حفظ التعديل' : 'إضافة سؤال'}
            </button>
            {editingId ? (
              <button type="button" onClick={cancelEdit} className="letter-hive-bank-ghost">
                إلغاء
              </button>
            ) : null}
          </div>
        </form>

        <div className="letter-hive-bank-letter-select">
          <label>
            عرض أسئلة حرف
            <select
              value={activeLetter}
              onChange={(event) => {
                setActiveLetter(event.target.value);
                if (!editingId) setForm((current) => ({ ...current, letter: event.target.value }));
              }}
            >
              {BASE_LETTERS.map((letter) => (
                <option key={letter} value={letter}>
                  {letter} - {questions[letter]?.length || 0} سؤال
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="letter-hive-bank-list">
          {activeQuestions.length === 0 ? (
            <div className="letter-hive-bank-empty">لا توجد أسئلة لهذا الحرف.</div>
          ) : activeQuestions.map((item) => (
            <article key={item.id} className="letter-hive-bank-item">
              <div>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
              <div className="letter-hive-bank-item-actions">
                <button type="button" onClick={() => startEdit(item)} aria-label="تعديل">
                  <Edit3 size={17} />
                </button>
                <button type="button" onClick={() => onDelete(item.id)} aria-label="حذف">
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default LetterHiveQuestionBank;
