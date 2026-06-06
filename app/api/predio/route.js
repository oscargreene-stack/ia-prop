import { NextResponse } from "next/server";

const FIXTURE = [
  { rol: "15160-3217-20", direccion: "CAROLINA RABAT 767", comuna: "VITACURA", m2_construidos: 366, m2_terreno: 1096, terreno_origen: "predio", ano: 1983, copropiedad: false },
  { rol: "15160-3217-1", direccion: "CAROLINA RABAT 745", comuna: "VITACURA", m2_construidos: 289, m2_terreno: 1019, terreno_origen: "predio", ano: 1991, copropiedad: false },
  { rol: "15160-3331-3", direccion: "CAROLINA RABAT 780 CS 1", comuna: "VITACURA", m2_construidos: 460, m2_terreno: 15352, terreno_origen: "bien_comun", ano: 2015, copropiedad: true },
  { rol: "15160-3331-4", direccion: "CAROLINA RABAT 780 CS 2", comuna: "VITACURA", m2_construidos: 458, m2_terreno: 15352, terreno_origen: "bien_comun", ano: 2015, copropiedad: true },
  { rol: "15160-3331-5", direccion: "CAROLINA RABAT 780 CS 3", comuna: "VITACURA", m2_construidos: 458, m2_terreno: 15352, terreno_origen: "bien_comun", ano: 2015, copropiedad: true }, { rol: "15108-236-2", direccion: "NAPOLEON 3179", comuna: "LAS CONDES", m2_construidos: 305, m2_terreno: 629, terreno_origen: "predio", ano: 1935, copropiedad: false }, { rol: "15108-215-38", direccion: "MAGDALENA 74", comuna: "LAS CONDES", m2_construidos: 375, m2_terreno: 766, terreno_origen: "predio", ano: 1946, copropiedad: false }, { rol: "15108-2461-242", direccion: "CALLE SAN JOSE DE LA SIERRA 1250 DP 552", comuna: "LAS CONDES", m2_construidos: 191, m2_terreno: 37700, terreno_origen: "bien_comun", ano: 2018, copropiedad: true }, { rol: "15108-202-66", direccion: "AVENIDA EL BOSQUE NORTE 0116 DP 201", comuna: "LAS CONDES", m2_construidos: 80, m2_terreno: 1945, terreno_origen: "bien_comun", ano: 1950, copropiedad: true }, { rol: "15108-139-6", direccion: "AVENIDA EL BOSQUE NORTE 0123 OF 201", comuna: "LAS CONDES", m2_construidos: 80, m2_terreno: 1549, terreno_origen: "bien_comun", ano: 2009, destino: "Oficina", copropiedad: true }, { rol: "15108-105-23", direccion: "COSTANERA SUR 2710 OF 301 TORRE A", comuna: "LAS CONDES", m2_construidos: 424, m2_terreno: 4620, terreno_origen: "bien_comun", ano: 2014, destino: "Oficina", copropiedad: true },
];

function norm(s) {
  return (s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const direccion = body.direccion || "";
    const comuna = body.comuna || "";
    const rol = body.rol || "";
    let res = [];
    if (rol) {
      res = FIXTURE.filter((p) => p.rol === rol.trim());
    } else {
      const d = norm(direccion);
      const c = norm(comuna);
      const toks = d.replace(/[0-9]/g, " ").split(/\s+/).filter((t) => t.length >= 3);
      const num = (d.match(/[0-9]+/) || [])[0];
      res = FIXTURE.filter((p) => {
        if (c && norm(p.comuna) !== c) return false;
        const pd = norm(p.direccion);
        if (!toks.every((t) => pd.includes(t))) return false;
        if (num) {
          const pn = (p.direccion.match(/[0-9]+/) || [])[0];
          if (pn && Math.abs(Number(pn) - Number(num)) > 4) return false;
        }
        return true;
      });
    }
    const candidatos = res.map((p) => {
      const parts = p.rol.split("-");
      return {
        rol: p.rol, destino: p.destino,
        direccion: p.direccion,
        m2_construidos: p.m2_construidos,
        m2_terreno: p.terreno_origen === "no_aplica" ? null : p.m2_terreno,
        terreno_origen: p.terreno_origen,
        ano_construccion: p.ano,
        es_copropiedad: p.copropiedad,
        deep_link: "https://datainmobiliaria.cl/reports/detalle_propiedad?cod_com=" + parts[0] + "&cod_mz=" + parts[1] + "&cod_pr=" + parts[2],
      };
    });
    const mensaje =
      candidatos.length === 0
        ? "No encontre la propiedad. Ingresa los m2 a mano."
        : candidatos.length === 1
        ? "Encontre la propiedad. Confirma que los datos son correctos."
        : "Encontre varias propiedades. Elegi cual es la tuya.";
    return NextResponse.json({ candidatos, total: candidatos.length, mensaje, _modo: "demo" });
  } catch (e) {
    return NextResponse.json({ candidatos: [], total: 0, mensaje: "Error al consultar." }, { status: 500 });
  }
}
