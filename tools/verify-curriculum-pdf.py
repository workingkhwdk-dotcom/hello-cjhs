#!/usr/bin/env python3
"""
편성표 PDF(files/curriculum-2026.pdf)와 챗봇·사이트가 쓰는 데이터(functions/curriculum_data.json)를 과목 단위로 대조한다.
실행: python3 tools/verify-curriculum-pdf.py   (pdftotext 필요: poppler-utils)  — 어긋나면 종료 코드 1.
대조 항목: 과목 순서·이름·유형(공통/일반/진로/융합)·기본학점·운영학점·성적처리, 학기별 학교 지정 학점, 선택군 구성, 총계(192/174/110/64/18).
"""
import json, re, subprocess, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
txt = subprocess.run(["pdftotext", "-layout", str(ROOT / "files/curriculum-2026.pdf"), "-"], capture_output=True, text=True, check=True).stdout
D = json.load(open(ROOT / "functions/curriculum_data.json", encoding="utf-8"))
ROW = re.compile(r"(공통|일반|진로|융합)\s+(.+?)\s{2,}(\d+)\s+(\d+)\s")
GRADE = {"성취도 5단계+석차등급O": "5", "성취도 5단계+석차등급X": "X", "성취도 3단계": "3", "이수/미이수": "P"}
errs = []

rows, pending = [], None
for line in txt.splitlines():
    m = ROW.search(line)
    if not m:
        continue
    g = next((v for k, v in GRADE.items() if k in line), None)
    rows.append({"type": m[1], "name": re.sub(r"\s+", " ", m[2]).strip(), "base": int(m[3]), "oper": int(m[4]), "grade": g, "line": line})

# 학교 지정 과목 | 학생 선택 과목 경계: "학교 지정 과목 교과 편성 학점" 줄이 나오기 전까지가 지정 과목(예술·기술가정은 "음악 ↔ 미술" 형태라 행 패턴과 별도 처리)
fixed_names = [c[2] for sem in D["FIXED"] for c in sem]
elective = [(g["id"], c) for g in D["ELECTIVE"] for c in g["courses"]]

pdf_fixed = [r for r in rows if r["name"] in set(fixed_names) or r["name"].split(" ↔ ")[0] in set(fixed_names)]
pdf_elec = rows[len(rows) - len(elective):]  # 선택과목은 PDF 맨 뒤쪽에 군 순서대로 나온다

if len(pdf_elec) != len(elective):
    errs.append(f"선택과목 수 불일치: PDF {len(pdf_elec)} / 데이터 {len(elective)}")
for (gid, c), r in zip(elective, pdf_elec):
    _, typ, name, base, oper, grade = c[:6]
    got = (r["type"], r["name"], r["base"], r["oper"], r["grade"])
    exp = (typ, name, base, oper, grade)
    if got != exp:
        errs.append(f"[{gid}군] 불일치 — PDF {got} / 데이터 {exp}")

pdf_by_name = {}
for r in pdf_fixed:
    pdf_by_name.setdefault(r["name"], r)
for sem in D["FIXED"]:
    for c in sem:
        if " ↔ " in c[2]:
            continue
        r = pdf_by_name.get(c[2])
        if not r:
            errs.append(f"[지정] PDF에 없는 과목: {c[2]}"); continue
        exp = (c[1], c[3], c[4])
        if (r["type"], r["base"], r["oper"]) != exp:
            errs.append(f"[지정] {c[2]} — PDF {(r['type'], r['base'], r['oper'])} / 데이터 {exp}")

# 총계 줄
def nums(label):
    for line in txt.splitlines():
        if label in line:
            return [int(x) for x in re.findall(r"\d+", line.split(label, 1)[1])]
    return []
checks = {"학교 지정 과목 교과 편성 학점": (D["TOTALS"]["fixed"], 110), "학생 선택 과목 교과 편성 학점": (D["TOTALS"]["elective"], 64),
          "총 교과 편성 학점": (D["TOTALS"]["subject"], 174), "창의적 체험활동 학점": (D["TOTALS"]["creative"], 18), "편성 학점 수": (D["TOTALS"]["all"], 192)}
for label, (per_sem, total) in checks.items():
    n = nums(label)
    if n[:6] != per_sem or (n[6] if len(n) > 6 else None) != total:
        errs.append(f"[총계] {label}: PDF {n} / 데이터 {per_sem} 합계 {total}")

print(f"PDF 선택과목 {len(pdf_elec)}개, 지정과목 {len(pdf_by_name)}개 대조")
if errs:
    print("\n".join("- " + e for e in errs)); sys.exit(1)
print("편성표 PDF와 데이터가 일치합니다.")
