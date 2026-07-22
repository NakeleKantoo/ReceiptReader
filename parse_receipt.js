
import axios from "axios";
import * as cheerio from "cheerio";

export async function readNfcFromUrl(html) {
  try {
    // if (!url) throw new Error("Nenhum URL passado");
    // url = url.trim();
    // const resp = await axios.get(url);
    const compra = {};
    const supermercado = { name: "", location: "" };
    let payment_method = "";
    let total = "";
    let cpf = "";
    const items = [];
    let datetime = "";
    const dateregex = /\d\d\/\d\d\/\d\d\d\d \d\d:\d\d:\d\d/;
    const keys = { "Qtde total de itens": "qtd", "UN": "unit", "Valor total R$": "price" };

    if (resp.status === 200) {
      const $ = cheerio.load(html);

      // Supermarket name and location
      const toptable = $("table.table.text-center");
      supermercado.name = toptable.find("b").first().text().trim();

      toptable.find("td").each((_, td) => {
        const text = $(td).text().trim();
        if (!text.startsWith("CNPJ")) supermercado.location = text;
      });

      // Total value
      $("div.container div.row").each((_, div) => {
        $(div)
          .find("strong")
          .each((_, strong) => {
            const text = $(strong).text().trim();
            if (text.startsWith("Valor total R$")) {
              total = $(div).find("div.col-lg-2 strong").text().trim();
            }
          });
      });

      // Payment method
      payment_method = $("#formPrincipal\\:j_idt74\\:0\\:j_idt82").text().split("-")[1]?.trim() || "";

      // Date/time
      $("td").each((_, td) => {
        const text = $(td).text().trim();
        if (dateregex.test(text)) datetime = text;
      });

      // CPF
      const consumidortbody = $("#collapse5 tbody");
      cpf = consumidortbody.find("td").eq(1).text().trim();

      // Items
      const table = $("#myTable");
      let currItem = {};

      table.find("td").each((_, td) => {
        const el = $(td);
        if (el.find("h7").length) {
          if (Object.keys(currItem).length > 0) items.push(currItem);
          currItem = {};

          const text = el.text().replace(/\t/g, "");
          const lines = text.split("\n").filter((l) => l.trim() !== "");
          currItem.name = lines[0];
          currItem.code = lines[1].split(":")[1].trim().replace(")", "");
        } else {
          const text = el.text();
          const [rawKey, rawVal] = text.split(":");
          const key = rawKey?.trim().replace("í", "i");
          const value = rawVal?.trim();
          if (key && value && keys[key]) currItem[keys[key]] = value;
        }
      });
      if (Object.keys(currItem).length > 0) items.push(currItem);

      compra.supermarket = supermercado;
      compra.items = items;
      compra.total = total;
      compra.datetime = datetime;
      compra.payment_method = payment_method;
      compra.cpf = cpf;
      compra.url = url;
    }

    return compra;
  } catch (err) {
    console.error("Error:", err);
    return err;
  }
}
