-- Ligas soportadas
insert into public.leagues (id, name, short_name, kind, logo_url, color, espn_sport, espn_league, odds_api_key, thesportsdb_id, sort_order) values
  ('nfl',    'National Football League',        'NFL',    'team',   'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png', '013369', 'football',   'nfl', 'americanfootball_nfl',   null,   1),
  ('nba',    'National Basketball Association', 'NBA',    'team',   'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png', 'C9082A', 'basketball', 'nba', 'basketball_nba',         null,   2),
  ('mlb',    'Major League Baseball',           'MLB',    'team',   'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png', '041E42', 'baseball',   'mlb', 'baseball_mlb',           null,   3),
  ('ufc',    'Ultimate Fighting Championship',  'UFC',    'combat', 'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png', 'D20A0A', 'mma',        'ufc', 'mma_mixed_martial_arts', null,   4),
  ('boxing', 'Boxeo',                           'Box',    'combat', null,                                                     'B8860B', null,         null,  'boxing_boxing',          '4445', 5),
  ('f1',     'Fórmula 1',                       'F1',     'racing', 'https://a.espncdn.com/i/teamlogos/leagues/500/f1.png',  'E10600', 'racing',     'f1',  null,                     null,   6)
on conflict (id) do update set
  name = excluded.name, short_name = excluded.short_name, kind = excluded.kind, logo_url = excluded.logo_url,
  color = excluded.color, espn_sport = excluded.espn_sport, espn_league = excluded.espn_league,
  odds_api_key = excluded.odds_api_key, thesportsdb_id = excluded.thesportsdb_id, sort_order = excluded.sort_order;
