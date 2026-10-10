CREATE TABLE public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no bigserial UNIQUE,
  token_hash text NOT NULL UNIQUE,
  customer_key text NOT NULL,
  account_number text,
  customer_name text,
  national_id_hash text,
  collector_employee_id text NOT NULL,
  collector_name text,
  status text NOT NULL DEFAULT 'active',
  upload_status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_requests_customer_idx ON public.document_requests(customer_key);
CREATE INDEX document_requests_collector_idx ON public.document_requests(collector_employee_id);
CREATE TABLE public.document_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_request_items_req_idx ON public.document_request_items(request_id);
CREATE TABLE public.customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.document_request_items(id) ON DELETE CASCADE,
  customer_key text NOT NULL,
  storage_path text NOT NULL,
  file_name text,
  mime text,
  size_bytes integer,
  is_current boolean NOT NULL DEFAULT true,
  seen_by_collector boolean NOT NULL DEFAULT false,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_documents_req_idx ON public.customer_documents(request_id);
CREATE TABLE public.document_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.document_requests(id) ON DELETE CASCADE,
  event text NOT NULL,
  actor text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.document_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.document_requests, public.document_request_items, public.customer_documents, public.document_activity_logs, public.document_library TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.document_requests_ref_no_seq TO service_role;
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_library ENABLE ROW LEVEL SECURITY;