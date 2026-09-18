-- Expand public review moderation for English and Tagalog profanity/insults.
-- Existing review rows are preserved; only new or updated submissions are checked.
create or replace function public.contains_inappropriate_review_language(p_text text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    lower(coalesce(p_text, '')) ~* '(^|[^[:alnum:]])(asshole|bastard|bitch|bullshit|cunt|dick|fuck|fucker|motherfucker|nigger|piss|porn|shit|slut|whore|putang[[:space:]]*ina|tangina|tanga|gago|gaga|ulol|tarantado|leche|lecheng|pakyu|pakyaw|burat|kantot|iyot|putok)([^[:alnum:]]|$)',
    false
  );
$$;

revoke all on function public.contains_inappropriate_review_language(text) from public;
grant execute on function public.contains_inappropriate_review_language(text) to anon, authenticated;

notify pgrst, 'reload schema';
