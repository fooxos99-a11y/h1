const choiceFields = ['normalEnd', 'scheduledEnd', 'reviewStart', 'reviewExpectedFaces', 'reviewActualFaces',
  'selectionStart', 'selectionEnd', 'selectionDirection', 'options'];
const collections = ['tasks', 'compensationTasks', 'taskQueue'];

/** Keep one copy of each repeated choice list on the wire and in durable snapshots. */
export function packTeacherEvaluation(evaluation, { version = 2 } = {}) {
  if (!evaluation || [1, 2].includes(evaluation.executionChoicesVersion)) return evaluation;
  const executionChoices = Object.create(null);
  const byContent = new Map();
  const byOptions = new WeakMap();
  const result = { ...evaluation, executionChoicesVersion: version, executionChoices };
  const layouts = [], strings = [], table = [];
  const layoutKeys = new Map(), stringKeys = new Map(), optionKeys = new Map();
  const encodeOption = option => {
    const signature = JSON.stringify(option);
    if (optionKeys.has(signature)) return optionKeys.get(signature);
    const entries = Object.entries(option).filter(([, value]) => value !== undefined);
    const layout = entries.map(([key, value]) => [key, typeof value === 'string' ? 's' : 'v']);
    const layoutKey = JSON.stringify(layout);
    if (!layoutKeys.has(layoutKey)) { layoutKeys.set(layoutKey, layouts.length); layouts.push(layout); }
    const values = entries.map(([, value]) => {
      if (typeof value !== 'string') return value;
      if (!stringKeys.has(value)) { stringKeys.set(value, strings.length); strings.push(value); }
      return stringKeys.get(value);
    });
    const index = table.length;
    table.push([layoutKeys.get(layoutKey), ...values]);optionKeys.set(signature, index);
    return index;
  };
  const pack = task => {
    if (!Array.isArray(task.options)) return task;
    const values = Object.fromEntries(choiceFields.filter(key => task[key] !== undefined).map(key => [key, task[key]]));
    const metadata = JSON.stringify({ ...values, options: undefined });
    let cached = byOptions.get(task.options);
    if (!cached) { cached = new Map(); byOptions.set(task.options, cached); }
    let key = cached.get(metadata);
    if (key === undefined) {
      const signature = JSON.stringify(values);
      key = byContent.get(signature);
      if (key === undefined) {
        key = `c${byContent.size}`;
        byContent.set(signature, key);
        executionChoices[key] = version === 2 ? { ...values, options: values.options.map(encodeOption) } : values;
      }
      cached.set(metadata, key);
    }
    const packed = { ...task, executionChoicesKey: key };
    for (const field of choiceFields) delete packed[field];
    return packed;
  };
  for (const key of collections) if (Array.isArray(evaluation[key])) result[key] = evaluation[key].map(pack);
  if (version === 2) Object.assign(result, { executionOptionLayouts: layouts, executionOptionStrings: strings, executionOptionTable: table });
  return result;
}

/** Restore the existing UI contract while sharing the immutable lists in memory. */
export function unpackTeacherEvaluation(evaluation) {
  if (!evaluation || ![1, 2].includes(evaluation.executionChoicesVersion)) return evaluation;
  const result = { ...evaluation };
  let choices = evaluation.executionChoices || {};
  if (evaluation.executionChoicesVersion === 2) {
    const table = evaluation.executionOptionTable || [], layouts = evaluation.executionOptionLayouts || [], strings = evaluation.executionOptionStrings || [];
    const options = table.map(row => {
      const layout = layouts[row[0]];
      if (!Array.isArray(layout) || row.length !== layout.length + 1) throw new Error('تعذر قراءة خيارات التسميع.');
      return Object.fromEntries(layout.map(([key, type], index) => [key, type === 's' ? strings[row[index + 1]] : row[index + 1]]));
    });
    choices = Object.fromEntries(Object.entries(choices).map(([key, value]) => [key, { ...value, options: value.options.map(index => {
      if (!Number.isInteger(index) || index < 0 || index >= options.length) throw new Error('تعذر قراءة خيارات التسميع.');
      return options[index];
    }) }]));
  }
  const unpack = task => {
    if (task.executionChoicesKey === undefined) return task;
    if (!Object.prototype.hasOwnProperty.call(choices, task.executionChoicesKey)) throw new Error('تعذر قراءة مقادير جلسة التسميع. أعد المحاولة.');
    const value = { ...task, ...choices[task.executionChoicesKey] };
    delete value.executionChoicesKey;
    return value;
  };
  delete result.executionChoicesVersion;
  delete result.executionChoices;
  delete result.executionOptionTable;
  delete result.executionOptionLayouts;
  delete result.executionOptionStrings;
  for (const key of collections) if (Array.isArray(evaluation[key])) result[key] = evaluation[key].map(unpack);
  return result;
}
