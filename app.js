do $$
declare
  t text;
begin
  foreach t in array array[
    'players',
    'games',
    'game_players',
    'teams',
    'team_members',
    'unit_payments',
    'monthly_payments',
    'cash_entries',
    'var_links'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'admin_all_' || t, t);

      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        'admin_all_' || t, t
      );
    end if;
  end loop;
end $$;
