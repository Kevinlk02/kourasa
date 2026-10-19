-- Koursa — 15. Canal utilisé pour chaque message au destinataire (whatsapp | sms | log).
alter table public.outbox_sms add column if not exists channel text not null default 'sms'
  check (channel in ('whatsapp', 'sms', 'log'));
create index if not exists outbox_sms_delivery_idx on public.outbox_sms (delivery_id, created_at desc);
