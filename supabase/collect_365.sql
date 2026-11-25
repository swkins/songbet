-- 365Scores 배구 (2026-11-22 사용자 요청) — 함수 supabase/functions/collect-365
-- 팀 이름표: 365 영어 이름 → 리그 관리 등록 이름 (없으면 영어 이름에서 ' (W)'만 뗌)
create table if not exists public.sports_team_names (
  sport text not null, league text not null, src text not null, ko text not null,
  primary key (sport, league, src)
);
alter table public.sports_team_names enable row level security;
create policy "sports_team_names read" on public.sports_team_names for select using (true);

insert into public.sports_team_names (sport, league, src, ko) values
 ('volleyball','이탈리아 남자','Allianz Milano','밀라노'), ('volleyball','이탈리아 남자','Lube Civitanova','루베 시비타노바'),
 ('volleyball','이탈리아 남자','Volley Perugia','페루지아'), ('volleyball','이탈리아 남자','Pallavolo Piacenza','피아첸차'),
 ('volleyball','이탈리아 남자','Verona Volley','베로나'), ('volleyball','이탈리아 남자','Cisterna Volley','Cisterna'),
 ('volleyball','이탈리아 남자','Pallavolo Padova','파도바'), ('volleyball','이탈리아 남자','Prata di Pordenone','Pordenone'),
 ('volleyball','이탈리아 남자','Cuneo Volley','Cuneo Volley'), ('volleyball','이탈리아 남자','Volley Monza','몬자'),
 ('volleyball','이탈리아 남자','Pallavolo Modena','모데나'), ('volleyball','이탈리아 남자','Trentino Volley','트렌티노'),
 ('volleyball','이탈리아 여자','Vallefoglia (W)','Vallefoglia'), ('volleyball','이탈리아 여자','Firenze (W)','Firenze'),
 ('volleyball','이탈리아 여자','Volley Talmassons (W)','Talmassons'), ('volleyball','이탈리아 여자','Novara (W)','노바라'),
 ('volleyball','이탈리아 여자','Chieri ''76 (W)','Chieri 76'), ('volleyball','이탈리아 여자','HR Macerata (W)','Macerata'),
 ('volleyball','이탈리아 여자','Scandicci (W)','스칸디치'), ('volleyball','이탈리아 여자','UYBA Busto Arsizio (W)','UYBA Busto Arsizio'),
 ('volleyball','이탈리아 여자','Brescia (W)','브레시아'), ('volleyball','이탈리아 여자','Consolini Volley (W)','San Giovanni'),
 ('volleyball','이탈리아 여자','Cuneo (W)','Cuneo'), ('volleyball','이탈리아 여자','Vero Volley (W)','몬자'),
 ('volleyball','이탈리아 여자','Conegliano (W)','코네글리아노'), ('volleyball','이탈리아 여자','Volley Bergamo (W)','베르가모')
on conflict (sport, league, src) do nothing;

-- 리그 관리에 없는 리그 추가
insert into public.volleyball_leagues (name) values ('폴란드 남자'), ('터키 남자'), ('터키 여자'), ('브라질 남자'), ('브라질 여자')
on conflict (name) do nothing;
