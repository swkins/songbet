# 오버롤 분석 시뮬레이션 (경기당 20,000회) — 입력 JSON: {경기키: {repl,k,home_adv,margin_est,w_ov,sigma,total,sigma_t,home:[[이름,오버롤,출전비중,출전확률,sd]],away:[...],lines:[홈 핸디],bands:[[lo,hi,라벨]]}}
# 사용: python3 scripts/overall_sim.py 입력.json  → 결과를 overall_analyses에 넣는다 (src/components/OverallAnalysisView.tsx가 표시)
import numpy as np, json, sys
rng = np.random.default_rng(7)
N = 20000
def team_rating(players, sims, repl):
    tot = np.zeros(sims); w = np.zeros(sims)
    for name, ov, share, p, sd in players:
        play = rng.random(sims) < p
        r = rng.normal(ov, sd, sims)
        tot += np.where(play, r * share, 0)
        w += np.where(play, share, 0)
    return (tot + (1 - w).clip(0) * repl) / np.maximum(w + (1 - w).clip(0), 1)
def run(g):
    H = team_rating(g['home'], N, g['repl']); A = team_rating(g['away'], N, g['repl'])
    ov_margin = g['k'] * (H - A) + g['home_adv']
    mu = g['w_ov'] * ov_margin + (1 - g['w_ov']) * g['margin_est']
    margin = mu + rng.normal(0, g['sigma'], N)
    total = rng.normal(g['total'], g['sigma_t'], N)
    hs = np.round((total + margin) / 2); as_ = np.round((total - margin) / 2)
    m = hs - as_
    return {'home_rating': round(float(H.mean()), 1), 'away_rating': round(float(A.mean()), 1),
        'ov_margin': round(float(ov_margin.mean()),1), 'exp_margin': round(float(m.mean()), 1),
        'exp_score': f"{int(np.median(hs))}-{int(np.median(as_))}",
        'home_win': round(float((m > 0).mean() * 100), 1),
        'bands': {lab: round(float(((m >= lo) & (m <= hi)).mean() * 100), 1) for lo, hi, lab in g['bands']},
        'covers': {str(line): round(float((m + line > 0).mean() * 100), 1) for line in g['lines']},
        'p10_90': [int(np.percentile(m, 10)), int(np.percentile(m, 90))]}
games = json.load(open(sys.argv[1]))
print(json.dumps({k: run(v) for k, v in games.items()}, ensure_ascii=False, indent=1))
