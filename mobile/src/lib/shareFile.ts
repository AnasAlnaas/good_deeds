import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** A file name any phone or computer takes: no characters they refuse. */
export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
}

/**
 * A CSV that Excel opens with Arabic intact (UTF-8 with a byte-order mark, as
 * the admin panel's): on a phone through the share sheet, on the web downloaded.
 */
export async function shareCsv(fileName: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    if (typeof v === 'number') return String(v);
    // Excel runs a cell starting with = + - @ (or a tab or carriage return) as a formula: names are typed by members.
    const risky = /^[=+\-@\t\r]/;
    const text = risky.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const name = `${safeFileName(fileName)}.csv`;
  if (Platform.OS === 'web') {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: name });
}
