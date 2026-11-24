-- The business name is confirmed in step 3's facts card (approved 24 Nov): step 2 no longer asks
-- "What's your business called?". Right after connect the brand is named from the best source:
-- the exact Facebook Page / Google Business name (sure), else the setup AI profile's suggestion,
-- else the profile's display name (guesses). Additive only; RLS unchanged (tenants already has
-- it). Written with the service role by the app after its role check, so no new column grants.
--
-- name_guessed_from: the platform a guessed name came from ('instagram', 'facebook', ...), shown
-- as "from Instagram" with a dashed hexagon until the owner checks it ("Looks good") or changes
-- it. Null when the name is sure (an exact page name, or set or checked by the owner).

alter table public.tenants
  add column if not exists name_guessed_from text
    check (name_guessed_from is null or char_length(name_guessed_from) between 1 and 40);
