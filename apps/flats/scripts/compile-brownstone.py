"""Compile reviewed SVG fragments from the Brownstone boards (Python standard library only).

The manifest's child ranges deliberately exclude mockup lighting, labels and backgrounds.
References are closed over transitively and namespaced at render time. No export scripts,
HTML, event handlers, or remote resources enter the application.
"""
from pathlib import Path
import json, re, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BOARDS = ROOT / 'design/brownstone/canvas'
# id, board, SVG index, direct child range [start,end), original art bounds.
ART = [
 ('present-1','Presents',0,9,34,[68,78,130,94]),
 ('present-2','Presents',1,8,36,[68,64,130,108]),
 ('present-3','Presents',2,7,31,[56,48,144,130]),
 ('moving-boxes','Decor-Textiles-Art',21,17,18,[16,26,96,92]),
 ('yarn-basket','Decor-Textiles-Art',21,24,25,[878,50,84,68]),
 ('snail-terrarium','Decor-Textiles-Art',21,25,26,[1011,30,64,88]),
 ('comfy-sofa','Furniture-Seating',1,13,48,[98,66,272,86]),
 ('armchair','Furniture-Seating',2,8,28,[74,36,112,120]),
 ('tall-bookshelf','Furniture-Storage',1,8,9,[326,16,84,102]),
 ('side-table','Furniture-Storage',2,6,16,[16,71,48,46]),
 ('crate-shelf','Furniture-Storage',6,7,37,[68,44,64,73]),
 ('wall-shelf','Furniture-Storage',7,7,29,[42,16,126,76]),
 ('tiny-tv','Furniture-Storage',8,6,29,[68,24,74,94]),
 ('record-player','Furniture-Storage',5,6,43,[36,44,138,74]),
 ('paper-lantern','Lights-Catalog',3,8,13,[84,0,40,70]),
 ('floor-lamp','Lights-Catalog',9,8,11,[58,20,38,111]),
 ('arc-lamp','Lights-Catalog',10,11,15,[30,12,124,121]),
 ('globe-chandelier','Lights-Catalog',5,9,16,[60,0,88,64]),
 ('candle-cluster','Lights-Catalog',14,9,15,[70,64,72,64]),
 ('fairy-lights','Lights-Catalog',16,8,10,[0,28,208,22]),
 ('lava-lamp','Lights-Catalog',17,8,14,[92,16,24,76]),
 ('neon-moon','Lights-Catalog',18,8,12,[76,22,54,83]),
 ('fireplace','Furniture-Storage',10,6,54,[42,7,122,111]),
 ('woven-rug','Decor-Textiles-Art',6,4,10,[31,34,188,66]),
 ('striped-rug','Decor-Textiles-Art',3,4,21,[16,39,218,62]),
 ('mountain-poster','Decor-Textiles-Art',8,4,5,[48,12,64,84]),
 ('gallery-trio','Decor-Textiles-Art',9,4,31,[26,5,102,66]),
 ('floor-cushion', 'Furniture-Seating', 10, 11, 22, [44, 106, 132, 48]),
 ('wooden-stool', 'Furniture-Seating', 11, 6, 25, [70, 64, 84, 90]),
 ('canopy-bed', 'Furniture-Seating', 8, 7, 42, [32, 6, 208, 148]),
 ('egg-chair', 'Furniture-Seating', 5, 11, 31, [92, 10, 118, 146]),
 ('tiny-aquarium', 'Furniture-Storage', 9, 6, 30, [60, 40, 90, 78]),
 ('bar-cart', 'Furniture-Storage', 4, 7, 45, [57, 20, 96, 98]),
 ('telescope', 'Furniture-Storage', 11, 16, 23, [88, 30, 72, 88]),
 ('wall-clock', 'Decor-Textiles-Art', 13, 4, 16, [48, 23, 58, 58]),
 ('scalloped-mirror', 'Decor-Textiles-Art', 11, 4, 14, [40, 17, 74, 74]),
 ('cuckoo-clock', 'Decor-Textiles-Art', 12, 4, 33, [44, 3, 66, 100]),
 ('pressed-flowers', 'Decor-Textiles-Art', 14, 4, 21, [33, 19, 84, 58]),
 ('postcard-string', 'Decor-Textiles-Art', 15, 3, 13, [6, 21, 142, 87]),
 ('woven-wall-hanging', 'Decor-Textiles-Art', 16, 3, 22, [50, 8, 54, 90]),
 ('quilt-bunting', 'Decor-Textiles-Art', 17, 4, 18, [6, 20, 142, 74]),
 ('plain-curtains', 'Windows-Treatments', 2, 7, 17, [86, 6, 132, 164]),
 ('floral-curtains', 'Windows-Treatments', 3, 7, 17, [86, 6, 132, 164]),
 ('velvet-drapes', 'Windows-Treatments', 4, 6, 18, [78, 4, 148, 168]),
 ('walnut-shutters', 'Windows-Treatments', 5, 6, 9, [106, 19, 92, 136]),
 ('roller-blind', 'Windows-Treatments', 6, 6, 14, [106, 19, 92, 136]),
 ('cafe-curtain', 'Windows-Treatments', 7, 7, 15, [106, 19, 92, 136]),
 ('wingback-chair', 'Furniture-Seating', 3, 10, 38, [62, 30, 116, 128]),
 ('peacock-chair', 'Furniture-Seating', 4, 10, 30, [66, 10, 128, 146]),
 ('spindle-daybed', 'Furniture-Seating', 6, 10, 37, [34, 50, 212, 104]),
 ('chaise-longue', 'Furniture-Seating', 7, 9, 32, [26, 46, 196, 110]),
 ('upright-piano', 'Furniture-Storage', 12, 16, 64, [94, 16, 242, 168]),
 ('artists-easel', 'Furniture-Storage', 13, 8, 25, [148, 0, 136, 184]),
 ('built-in-bookcase', 'Furniture-Storage', 14, 12, 82, [100, 0, 232, 182]),
 ('gilt-mirror', 'Decor-Textiles-Art', 10, 4, 18, [50, 4, 54, 94]),
 ('pleated-pendant', 'Lights-Catalog', 4, 8, 13, [76, 0, 56, 60]),
 ('wicker-pendant', 'Lights-Catalog', 6, 9, 14, [72, 0, 64, 56]),
 ('pierced-lantern', 'Lights-Catalog', 7, 9, 18, [88, 0, 32, 88]),
 ('wall-sconce', 'Lights-Catalog', 12, 12, 17, [92, 34, 24, 36]),
]

def board(name):
    raw=(BOARDS/(name+'.dc.html')).read_text()
    return [ET.fromstring(x) for x in re.findall(r'<svg\b[^>]*>.*?</svg>',raw,re.S)]

def fragment(name, index, start, end, bounds, unwrap=False):
    svgs=board(name)
    nodes=list(svgs[index])[start:end]
    if unwrap:
        nodes[0].attrib.pop('transform',None)
    lookup={node.get('id'):node for svg in svgs for node in svg.iter() if node.get('id')}
    body=''.join(ET.tostring(n,encoding='unicode') for n in nodes)
    defs=[]; seen=set()
    def refs(s): return set(re.findall(r'(?:url\(#|href="#)([\w-]+)',s))
    pending=refs(body)
    while pending:
        key=sorted(pending)[0];pending.remove(key)
        if key in seen: continue
        seen.add(key)
        if key not in lookup: raise ValueError(f'{name}: missing {key}')
        value=ET.tostring(lookup[key],encoding='unicode')
        defs.append(value);pending|=refs(value)-seen
    markup='<defs>'+''.join(defs)+'</defs>'+body
    markup=re.sub(r'(id="|href="#|url\(#)([\w-]+)',r'\1__ID__\2',markup)
    assert not re.search(r'<script|<foreignObject|on\w+=|https?://',markup)
    return {'bounds':bounds,'svg':markup}

result={key:[fragment(name,idx,start,end,bounds)] for key,name,idx,start,end,bounds in ART}
# Growth is real artwork at all three stages; a common viewbox keeps the pot anchored.
for key,idx,start,bounds in [
 ('succulent-pot',4,4,[-29,53,58,70]),
 ('hanging-pothos',5,5,[-40,0,80,139]),
 ('monstera',6,3,[-42,10,84,132]),
 ('eucalyptus-garland',12,10,[-48,16,96,72]),
 ('blossom-vase',13,3,[-42,12,84,130]),
 ('dried-roses',14,3,[-36,20,72,110]),
]:
 result[key]=[fragment('Decor-Plants',idx,start+s,start+s+1,bounds,True) for s in range(3)]
# Pet appearances keep a consistent coat across moods; existing animation rig drives motion.
for kind,idx in [('cat',7),('dog',13),('bunny',19),('frog',23),('duck',28)]:
 result['pet-'+kind]=[fragment('Pets-Moods',idx,9,10,[-34,-58,68,60],True)]

for kind,idx in [('cat',9),('dog',15),('bunny',20),('frog',25),('duck',30)]:
 result['pet-'+kind+'-sleep']=[fragment('Pets-Moods',idx,9,10,[-34,-58,68,60],True)]

# Keep the ginger cat and tan dog recognisable when they curl up for a nap.
pet_coats = {
 'pet-cat-sleep': {'#302825':'#C9702E','#171311':'#A2521E','#0A0807':'#6A3418','#4A3E38':'#EC9E56','#141010':'#A2521E','#1E1816':'#C9702E','#221A18':'#D47E3A','#3A302C':'#9A4818','#8A7E72':'#F2B878'},
 'pet-dog-sleep': {'#ABABB3':'#D2AA72','#8E8E96':'#A88050','#5E5E66':'#6A4E2C','#6E6E76':'#7A5A34','#9A9AA2':'#B89060','#7E7E86':'#8A6A40','#8A8A92':'#A07A48','#A4A4AC':'#D8BC8C','#86868E':'#A88050','#9C9CA4':'#C8A272','#C2C2CA':'#E6CEA0'},
}
for key,colors in pet_coats.items():
 result[key][0]['svg']=re.sub(r'#[a-fA-F0-9]{6}',lambda m: colors.get(m[0].upper(),m[0]),result[key][0]['svg'])

out=ROOT/'src/art/brownstone/assets.json'
out.write_text(json.dumps(result,separators=(',',':'))+'\n')
print(f'Compiled {len(result)} Brownstone assets ({out.stat().st_size//1024} KiB).')

# Architecture from the approved street; all resident-specific details are live UI.
street=board('Brownstone-Street')[0]
for index in sorted([41,45,46,47,48,49,50,52,53,70,71,76,83],reverse=True):
 street.remove(list(street)[index])
street.attrib={'xmlns':'http://www.w3.org/2000/svg','viewBox':'0 0 1440 800','fill':'none'}
# Texture is cached as part of the static asset, not recalculated for each live room.
public=ROOT/'public/brownstone';public.mkdir(exist_ok=True)
(public/'street.svg').write_text(ET.tostring(street,encoding='unicode'))

import random, struct, zlib
rng=random.Random(47)
raw=b''.join(b'\x00'+bytes(rng.randrange(75,181) for _ in range(256)) for _ in range(256))
def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
(public/'grain.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',256,256,8,0,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
