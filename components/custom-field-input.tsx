'use client';

import type { HTMLInputTypeAttribute } from 'react';

type CustomFieldInputProps = {
  field: {
    id: string;
    name: string;
    type: string;
    options: string | null;
    helpText?: string | null;
    required?: boolean;
    defaultValue?: string | null;
  };
  value: string;
  onChange: (value: string) => void;
};

function optionsFromJson(value: string | null) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function CustomFieldInput({ field, value, onChange }: CustomFieldInputProps) {
  const options = optionsFromJson(field.options);
  const inputClass = 'bg-bg-base border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent';
  const currentValue = value || field.defaultValue || '';

  if (field.type === 'SELECT') {
    return (
      <select value={currentValue} required={field.required} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">Selecione...</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  if (field.type === 'MULTI_SELECT') {
    let selected: string[] = [];
    try { selected = JSON.parse(currentValue || '[]'); } catch { selected = []; }
    return (
      <select
        multiple
        value={selected}
        required={field.required}
        onChange={(event) => onChange(JSON.stringify(Array.from(event.target.selectedOptions, (option) => option.value)))}
        className={`${inputClass} min-h-20`}
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  }

  if (field.type === 'LONG_TEXT') {
    return <textarea value={currentValue} required={field.required} onChange={(event) => onChange(event.target.value)} className={`${inputClass} min-h-20 resize-y`} />;
  }

  if (field.type === 'CHECKBOX' || field.type === 'BOOLEAN') {
    return (
      <label className="flex items-center gap-2 text-xs text-white">
        <input type="checkbox" checked={currentValue === 'true'} onChange={(event) => onChange(String(event.target.checked))} className="accent-accent" />
        {currentValue === 'true' ? 'Sim' : 'Não'}
      </label>
    );
  }

  const inputType: HTMLInputTypeAttribute = {
    NUMBER: 'number',
    CURRENCY: 'number',
    DATE: 'date',
    DATETIME: 'datetime-local',
    PHONE: 'tel',
    EMAIL: 'email',
    URL: 'url',
  }[field.type] as HTMLInputTypeAttribute || 'text';

  return (
    <input
      type={inputType}
      step={field.type === 'CURRENCY' ? '0.01' : undefined}
      value={currentValue}
      required={field.required}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    />
  );
}
