-- Personal HQ never signs users in; only the anonymous (publishable key) role needs the sync functions.
revoke execute on function public.phq_sync_pull(text, bigint, integer) from authenticated;
revoke execute on function public.phq_sync_push(text, jsonb) from authenticated;
revoke execute on function public.phq_sync_delete_space(text) from authenticated;
