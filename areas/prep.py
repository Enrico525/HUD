"""Gera terrenos.json a partir do CSV do IPTU do GeoSampa.

Uso:  python prep.py IPTU_2026.zip [area_minima_m2]
Baixe o zip em https://novogeosampa.prefeitura.sp.gov.br  (camada Lote > Download > IPTU).
"""
import csv, io, json, os, re, sys, zipfile

src = sys.argv[1]
AREA_MIN = float(sys.argv[2]) if len(sys.argv) > 2 else 500
# Zoneamento por lote, gerado por zona.py (opcional).
ZONAS = json.load(open("zonas.json", encoding="utf-8")) if os.path.exists("zonas.json") else {}


def num(s):
    s = (s or "").strip()
    if not s:
        return None
    if "," in s:  # formato brasileiro 1.234,56
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def abrir(path):
    if path.lower().endswith(".zip"):
        z = zipfile.ZipFile(path)
        name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        raw = z.read(name)
    else:
        raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass


text = abrir(src)
sep = ";" if text[:2000].count(";") > text[:2000].count(",") else ","
rd = csv.DictReader(io.StringIO(text), delimiter=sep)
rd.fieldnames = [f.strip().upper() for f in rd.fieldnames]
need = ["NUMERO DO CONTRIBUINTE", "NOME DE LOGRADOURO DO IMOVEL", "NUMERO DO IMOVEL", "AREA DO TERRENO"]
missing = [c for c in need if c not in rd.fieldnames]
assert not missing, f"Colunas não encontradas: {missing}\nColunas do arquivo: {rd.fieldnames}"

ano = None
lotes = {}  # condomínios viram uma linha só: todas as unidades repetem a área do terreno
total = 0
for r in rd:
    total += 1
    area = num(r.get("AREA DO TERRENO"))
    if area is None or area < AREA_MIN:
        continue
    ano = ano or (r.get("ANO DO EXERCICIO") or "").strip()
    sql = (r["NUMERO DO CONTRIBUINTE"] or "").strip()
    cond = (r.get("NUMERO DO CONDOMINIO") or "").strip()
    is_cond = bool(re.sub(r"[0\-\s]", "", cond))
    key = (sql[:6] + "|" + cond) if is_cond else sql  # setor+quadra+condomínio
    if key in lotes:
        lotes[key][-1] += 1
        continue
    lotes[key] = [
        f"{sql[:3]}.{sql[3:6]}.{sql[6:]}" if re.fullmatch(r"\d{10}-\d", sql) else sql,  # 001.003.0001-4
        " ".join((r.get("NOME DE LOGRADOURO DO IMOVEL") or "").split()),
        (r.get("NUMERO DO IMOVEL") or "").strip().lstrip("0") or "0",
        "" if is_cond else (r.get("COMPLEMENTO DO IMOVEL") or "").strip(),
        (r.get("BAIRRO DO IMOVEL") or "").strip(),
        (r.get("CEP DO IMOVEL") or "").strip(),
        area,
        ZONAS.get(sql[:6] + "C" + cond[:2] if is_cond else sql[:10], ""),
        num(r.get("VALOR DO M2 DO TERRENO")),
        1,
    ]

rows = list(lotes.values())
assert rows, "Nenhum terreno passou no filtro — confira o arquivo."
out = {"ano": ano, "areaMin": AREA_MIN,
       "cols": ["sql", "logradouro", "numero", "complemento", "bairro", "cep", "area", "zona", "vm2", "n"],
       "rows": rows}
with open("../public/areas/terrenos.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(f"{total:,} registros lidos; {len(rows):,} terrenos >= {AREA_MIN:g} m² gravados em public/areas/terrenos.json (exercício {ano}).")
