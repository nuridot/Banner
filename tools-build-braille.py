# -*- coding: utf-8 -*-
import re, json, io, sys
from html.parser import HTMLParser
from semojum_braille.encoder import translate_plain

import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'index.html')
HAN = re.compile(r'[가-힣A-Za-z0-9]')
SKIP = {'script', 'style', 'svg', 'title'}

class W(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.depth_skip = 0; self.in_body = False; self.out = []; self.stack = []
    def handle_starttag(self, tag, attrs):
        if tag == 'body': self.in_body = True; return
        void = tag in ('br','img','input','meta','link','hr','circle','path','source','col')
        a = dict(attrs)
        skip = tag in SKIP or 'data-nobr' in a
        if not void: self.stack.append((tag, skip))
        if skip and not void: self.depth_skip += 1
    def handle_startendtag(self, tag, attrs): pass
    def handle_endtag(self, tag):
        if tag == 'body': self.in_body = False; return
        while self.stack:
            t, sk = self.stack.pop()
            if sk: self.depth_skip -= 1
            if t == tag: break
    def handle_data(self, d):
        if self.in_body and not self.depth_skip and HAN.search(d):
            self.out.append(d)

src = io.open(SRC, encoding='utf-8').read()
w = W(); w.feed(src)
texts = w.out
print('한글 텍스트 노드', len(texts), '개')

def tr(t):
    lead = t[:len(t) - len(t.lstrip())]
    trail = t[len(t.rstrip()):]
    return lead + translate_plain(t.strip()) + trail

brl = [tr(t) for t in texts]
out = os.path.join(HERE, 'assets', 'braille.js')
io.open(out, 'w', encoding='utf-8').write('window.BRL=' + json.dumps(brl, ensure_ascii=False) + ';\n')
print('assets/braille.js 갱신:', os.path.getsize(out), '바이트')
print('보기:', texts[0][:30], '->', brl[0][:30])
