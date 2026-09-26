// Опция «Записать сказку». Четыре адреса живут в одном файле (метка __r,
// см. lib/route.js), чтобы уложиться в двенадцать функций Vercel:
//
//   POST /api/clean       {audio}
//   POST /api/transcribe  {url|audio}
//   POST /api/scenes      {sentences, lang}
//   POST /api/polish      {sentences, lang}
import { asked } from '../lib/route.js';
import { isRecordRoute, recordRoute } from '../lib/record.js';

export default async function handler(req, res) {
  const route = asked(req);
  if (isRecordRoute(route)) return recordRoute(route, req, res);
  return res.status(404).json({ error: 'неизвестный адрес: ' + route });
}
