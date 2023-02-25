from sqlalchemy import Column, DATE, REAL, INTEGER
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

def table_class(sym):

    class Stock(Base):

        __tablename__ = sym
        __table_args__ = {'extend_existing': True}

        # these vars must have same name as columns in the DB table
        Date = Column(DATE, primary_key=True)
        Open = Column(REAL, nullable=False)
        High = Column(REAL, nullable=False)
        Low = Column(REAL, nullable=False)
        Close = Column(REAL, nullable=False)
        Volume = Column(INTEGER, nullable=False)

        @property
        def serialize(self):
            return [ self.Date,
                     self.Open,
                     self.High,
                     self.Low,
                     self.Close,
                     self.Volume
                   ]

    return Stock



