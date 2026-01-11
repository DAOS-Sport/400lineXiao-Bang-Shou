import requests
from bs4 import BeautifulSoup

def check_lifeguard_final(id_card):
    url = "https://isports.sa.gov.tw/Apps/LGM/LGM09/LGM0970Q_01V1.aspx?MENU_PRG_CD=5&ITEM_PRG_CD=1"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': url
    }

    session = requests.Session()
    print(f"🚀 正在連接體育署網站並查詢 ID: {id_card} ...")

    try:
        res_get = session.get(url, headers=headers, timeout=15)
        soup = BeautifulSoup(res_get.text, 'html.parser')

        payload = {}
        for hidden in soup.find_all("input", type="hidden"):
            payload[hidden.get("name")] = hidden.get("value")

        payload['ctl00$IsportContent$TYPE'] = 'IDN'
        payload['ctl00$IsportContent$Q_LG_LIC_HOLDER_IDN'] = id_card
        payload['ctl00$IsportContent$btnQuery'] = '查詢'
        payload['ctl00$IsportContent$Q_LG_LIC_EXAM_UNIT_CD'] = ''
        payload['ctl00$IsportContent$Q_LG_LIC_EXAM_TP_CD'] = ''

        res_post = session.post(url, data=payload, headers=headers, timeout=15)
        
        result_soup = BeautifulSoup(res_post.text, 'html.parser')
        
        grid = result_soup.find('table', id='IsportContent_DataGrid')

        if grid:
            rows = grid.find_all('tr')
            if len(rows) > 1:
                print("\n" + "="*30)
                print(f"✅ 查詢成功！身分證: {id_card}")
                
                results = []
                for i in range(1, len(rows)):
                    cols = rows[i].find_all('td')
                    name = cols[2].text.strip()
                    license_type = cols[1].text.strip()
                    license_no = cols[3].text.strip()
                    expiry_date = cols[5].text.strip()
                    
                    result = {
                        "name": name,
                        "license_type": license_type,
                        "license_no": license_no,
                        "expiry_date": expiry_date
                    }
                    results.append(result)
                    
                    print(f"\n--- 證照 #{i} ---")
                    print(f"姓名：{name}")
                    print(f"資格：{license_type}")
                    print(f"證號：{license_no}")
                    print(f"效期：{expiry_date}")
                
                print("="*30 + "\n")
                return {"success": True, "data": results}

        if "查無資料" in res_post.text:
            print(f"\n❌ 網站回傳：查無此人 ({id_card})，證照可能已過期或無效。\n")
            return {"success": False, "error": "查無資料"}
        else:
            print("\n⚠️ 查詢異常：找不到結果表格。")
            return {"success": False, "error": "查詢異常"}

    except Exception as e:
        print(f"🔥 發生程式錯誤: {e}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    check_lifeguard_final("A131967933")
