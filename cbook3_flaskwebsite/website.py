from flask import Flask, render_template, request, jsonify#, redirect, url_for
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database_setup import Base, table_class
import numpy as np


app = Flask(__name__)
app.config.from_object(__name__)

engine = create_engine('mysql+mysqldb://cbook3:stockpricehist@cbook3.mysql.pythonanywhere-services.com/cbook3$StockData', pool_recycle=250)
Base.metadata.bind = engine
DBSession = sessionmaker(bind=engine)
price_hist_table_names = engine.table_names() # list of all table names in DB

# if website URL ends in / then call the function
@app.route('/')
def load_main_page():
    return render_template('index.html')

@app.route('/HandwrittenDigits8x8/')
def load_digits():
    return render_template('HandwrittenDigits8x8.html')

@app.route('/PracticeTrading/')
def load_chart():
    return render_template('PracticeTrading.html')

@app.route('/ChartPractice/')
def load_chart_notes():
    return render_template('ChartPractice.html')

#@app.route('/.well-known/acme-challenge')
#def load_wellknown():
#    return render_template('/home/cbook3/letsencrypt/wellknown')

# this GET request is made from the JS when it first runs (based on its position in the HTML)
@app.route('/PracticeTrading/getMkt/', methods=['GET'])
def get_mkt():
    session = DBSession()
    mkt = request.args.get('mkt') # get value assoc with keyword'mkt'
    if mkt == 'SP500':
        SP500_table = table_class('SP500') # set up DB query
        SP500_hist = session.query(SP500_table).order_by(SP500_table.Date.desc())
        hist_list = np.array([ph.serialize for ph in SP500_hist])
        response = jsonify( {'sp500_dates': hist_list[:, 0].tolist(),
                             'sp500_cl': hist_list[:, 4].tolist()
                            } )
    session.close()
    return response


@app.route('/PracticeTrading/nextChart/', methods=['GET'])
def next_chart():
    requested_sym = request.args.get('requested_sym')
    dates, op, hi, lo, cl, vol = [], [], [], [], [], []
    status = 1
    if requested_sym == '' or requested_sym is None:
        sym = 'SP500'
        while sym == 'SP500':
            sym = np.random.choice(price_hist_table_names)
            dates, op, hi, lo, cl, vol = fetch_DOHLCV(sym)
    else:

        sym = requested_sym.upper()

        if sym in price_hist_table_names:
            dates, op, hi, lo, cl, vol = fetch_DOHLCV(sym)
        else:
            status = 0
            dates = np.array([])
            op = np.array([])
            hi = np.array([])
            lo = np.array([])
            cl = np.array([])
            vol = np.array([])

    response = jsonify( {'tickerSym': sym,
                         'dates': dates.tolist(),
                         'op': op.tolist(),
                         'hi': hi.tolist(),
                         'lo': lo.tolist(),
                         'cl': cl.tolist(),
                         'vol': vol.tolist(),
                         'status': status
                        })
    return response


def fetch_DOHLCV(sym):
    session = DBSession()
    mapped_table = table_class(sym) # set up DB query
    price_hist = session.query(mapped_table).order_by(mapped_table.Date.desc()) # entire history
    hist_list = np.array([ph.serialize for ph in price_hist])
    dates = hist_list[:, 0] # date
    op = np.array(hist_list[:, 1], dtype=np.float64)
    hi = np.array(hist_list[:, 2], dtype=np.float64)
    lo = np.array(hist_list[:, 3], dtype=np.float64)
    cl = np.array(hist_list[:, 4], dtype=np.float64)
    vol = np.array(hist_list[:, 5], dtype=np.float64)

    session.close()
    return dates, op, hi, lo, cl, vol
