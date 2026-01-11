import requests
from bs4 import BeautifulSoup
import sys
import json

def check_lifeguard(id_card):
    url = "https://isports.sa.gov.tw/Apps/LGM/LGM09/LGM0970Q_01V1.aspx?MENU_PRG_CD=5&ITEM_PRG_CD=1"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': url
    }

    session = requests.Session()

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
                results = []
                for i in range(1, len(rows)):
                    cols = rows[i].find_all('td')
                    result = {
                        "name": cols[2].text.strip(),
                        "licenseType": cols[1].text.strip(),
                        "licenseNo": cols[3].text.strip(),
                        "expiryDate": cols[5].text.strip()
                    }
                    results.append(result)
                
                print(json.dumps({"success": True, "data": results}, ensure_ascii=False))
                return

        if "查無資料" in res_post.text:
            print(json.dumps({"success": False, "error": "查無資料"}, ensure_ascii=False))
        else:
            print(json.dumps({"success": False, "error": "查詢異常"}, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        id_card = sys.argv[1]
        check_lifeguard(id_card)
    else:
        print(json.dumps({"success": False, "error": "未提供身分證字號"}, ensure_ascii=False))
