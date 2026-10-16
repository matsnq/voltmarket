import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Upload, FileDown, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Panel, Banner, btn, Table } from '../../components/admin/ui';

export default function BulkImport() {
  const [format, setFormat] = useState('csv');
  const [data, setData] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [rowErrors, setRowErrors] = useState([]);
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(false);

  // Read the file in the browser and post its text. Keeps the endpoint a
  // plain JSON route instead of multipart, and lets the admin see and edit
  // the contents before importing.
  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFormat(file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv');
    const reader = new FileReader();
    reader.onload = () => setData(String(reader.result));
    reader.readAsText(file);
  }

  async function submit(e) {
    e.preventDefault();
    setBanner('');
    setResult(null);
    setRowErrors([]);
    if (!data.trim()) return setBanner('Choose a file or paste some data first.');

    setBusy(true);
    try {
      const res = await api('/admin/products/bulk', { method: 'POST', body: { format, data } });
      setResult(res);
    } catch (err) {
      setBanner(err.message);
      setRowErrors(err.details || []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Helmet><title>Bulk Import — Voltmarket Admin</title></Helmet>

      <Panel
        title="Bulk import products"
        action={
          <a
            href="/api/v1/admin/products/bulk/template"
            className={`${btn.secondary} flex items-center gap-1.5`}
            download
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            CSV template
          </a>
        }
      >
        <p className="mb-4 text-sm text-gray-600">
          Upload a CSV or JSON file of products. <strong>Every row is validated before anything
          is written</strong> — if one row is wrong, nothing is imported and the problems are
          listed below. A product whose name matches an existing one is updated rather than
          duplicated.
        </p>

        <Banner onDismiss={() => setBanner('')}>{banner}</Banner>

        {rowErrors.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-200">
            <Table headers={['Line', 'Field', 'Problem']}>
              {rowErrors.map((e, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5 font-mono text-xs">{e.line}</td>
                  <td className="px-2 py-1.5 text-gray-600">{e.field}</td>
                  <td className="px-2 py-1.5">{e.message}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}

        {result && (
          <div role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <span>
              Imported {result.total} row{result.total === 1 ? '' : 's'}:{' '}
              <strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated.
            </span>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className="mb-4">
            <label htmlFor="bulk-file" className="mb-1 block text-sm font-medium text-gray-700">
              File
            </label>
            <input
              id="bulk-file"
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={onFile}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-gray-800"
            />
            {fileName && <p className="mt-1 text-xs text-gray-500">Loaded {fileName}</p>}
          </div>

          <fieldset className="mb-4">
            <legend className="mb-1 text-sm font-medium text-gray-700">Format</legend>
            <div className="flex gap-4">
              {['csv', 'json'].map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} className="h-4 w-4 accent-brand-600" />
                  {f.toUpperCase()}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mb-4">
            <label htmlFor="bulk-data" className="mb-1 block text-sm font-medium text-gray-700">
              Contents <span className="text-xs font-normal text-gray-500">(editable before import)</span>
            </label>
            <textarea
              id="bulk-data"
              rows={10}
              value={data}
              onChange={(e) => setData(e.target.value)}
              spellCheck={false}
              placeholder={'name,description,category,brand,price,stock\nExample Charger,"A 22 kW charger",home-chargers,Wallbox,699.00,25'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <button type="submit" disabled={busy} className={`${btn.primary} flex items-center gap-1.5`}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Importing…' : 'Import products'}
          </button>
        </form>
      </Panel>

      <Panel title="Column reference">
        <Table headers={['Column', 'Required', 'Notes']}>
          {[
            ['name', 'yes', 'Matches an existing product by name to update it'],
            ['description', 'yes', 'At least 10 characters'],
            ['category', 'yes', 'Category slug or name, e.g. home-chargers'],
            ['brand', 'yes', 'Brand slug or name, e.g. Wallbox'],
            ['price', 'yes', 'In euros, e.g. 699.00 — or priceCents for whole cents'],
            ['stock', 'yes', 'Whole number'],
            ['weightKg, lengthMm, widthMm, heightMm', 'no', 'Metric only; imperial is derived'],
            ['rangeKm, batteryKwh, motorPowerKw', 'no', 'Electric vehicles only'],
            ['isActive', 'no', 'true or false, defaults to true'],
          ].map(([col, req, note]) => (
            <tr key={col}>
              <td className="px-2 py-1.5 font-mono text-xs">{col}</td>
              <td className="px-2 py-1.5">{req}</td>
              <td className="px-2 py-1.5 text-gray-600">{note}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
