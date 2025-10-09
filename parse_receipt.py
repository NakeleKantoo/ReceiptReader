from PIL import Image
import requests
from bs4 import BeautifulSoup
import json
from qreader import QReader
from cv2 import imread
import sys
import re

img = imread(sys.argv[1])

reader = QReader()

decoded = reader.detect_and_decode(img)

url = decoded[0]

resp = requests.get(url)

compra = {}

supermercado = {'location':'', 'name':''}

payment_method = ''
total = ''

items = []

datetime = ""
dateregex = r"\d\d\/\d\d\/\d\d\d\d\ \d\d\:\d\d\:\d\d" #00/00/0000 00:00

keys = {'Qtde total de itens':'qtd', 'UN':'unit', 'Valor total R$':'price'}

if resp.status_code == 200:

    soup = BeautifulSoup(resp.text, 'html.parser')

    #get supermercado name and location
    toptable = soup.find('table', {'class':'table text-center'})

    #name
    supermarketName = toptable.find('b')
    supermercado['name'] = supermarketName.text
    
    #location
    for i in toptable.find_all('td'):
        if not i.text.startswith('CNPJ'):
            supermercado['location'] = i.text


    # get total value
    for i in soup.find('div',{'class':'container'}).find_all('div',{'class':'row'}):
        for j in i.find_all('strong'):
            if j.text.startswith('Valor total R$'):
                total = i.find('div',{'class':'col-lg-2'}).find('strong').text
            

    #get fucking payment method
    payment_method = soup.find('div',{'id':'formPrincipal:j_idt74:0:j_idt82'}).text.split('-')[1].strip()

    #get date time
    for i in soup.find_all('td'):
        if re.match(dateregex, i.text):
            datetime = i.text.strip()


    table = soup.find('tbody',{'id':"myTable"})
    #print(soup, table)
    
    # get todos itens em compra
    currItem = {}
    for i in table.find_all('td'):
        if i.find('h7'):
            if currItem != {}: items.append(currItem)
            currItem = {}
            text = i.text
            text = text.replace('\t','')
            split = str.split(text,"\n")
            currItem['name'] = split[0]
            currItem['code'] = split[1].split(":")[1].strip().replace(")",'')
        else:
            text = i.text
            split = str.split(text,":")
            key = split[0].strip().replace('í','i')
            key = keys[key]
            value = split[1].strip()
            currItem[key] = value
    items.append(currItem)

    compra['supermarket'] = supermercado
    compra['items'] = items 
    compra['total'] = total
    compra['datetime'] = datetime
    compra['payment_method'] = payment_method
    compra['url'] = url


print(json.dumps(compra,indent=4,ensure_ascii=False))
