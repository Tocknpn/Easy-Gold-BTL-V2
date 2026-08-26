export default function MerchReport() {
  return (
    <div>
      <div className="demo-banner">
        <i className="fa-solid fa-circle-info"></i> Aggregated merchandise distribution report. Data comes from `merch_items` JSON in each submission.
      </div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input type="date" defaultValue="2025-03-01" style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
        <input type="date" defaultValue="2025-03-31" style={{ padding: '7px', fontSize: '12px', width: 'auto' }} />
        <select style={{ padding: '7px', fontSize: '12px', width: 'auto' }}>
          <option>All Teams</option>
          <option>KPV Team</option>
          <option>Agency Team</option>
        </select>
      </div>

      <div className="grid-3" style={{ marginBottom: '20px' }}>
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Top Merch Item</div>
          <div style={{ fontSize: '22px', color: 'var(--gold)', fontWeight: 700 }}>Gold Flyer</div>
        </div>
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Units Distributed</div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>2,840</div>
        </div>
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--txt-sub)', marginBottom: '6px' }}>Total Merch Cost</div>
          <div style={{ fontSize: '22px', color: 'var(--green)', fontWeight: 700 }}>₭7.32M</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '16px', fontSize: '15px' }}>Merchandise Distribution Breakdown</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>ITEM NAME</th>
              <th>TOTAL UNITS</th>
              <th>COST PER UNIT</th>
              <th>TOTAL COST</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Gold Flyer</td>
              <td>1,650</td>
              <td>₭2,000</td>
              <td style={{ color: 'var(--green)', fontWeight: 700 }}>₭3,300,000</td>
            </tr>
            <tr>
              <td>Tote Bag</td>
              <td>390</td>
              <td>₭15,000</td>
              <td style={{ color: 'var(--green)', fontWeight: 700 }}>₭5,850,000</td>
            </tr>
            <tr>
              <td>Pen Set</td>
              <td>280</td>
              <td>₭5,000</td>
              <td style={{ color: 'var(--green)', fontWeight: 700 }}>₭1,400,000</td>
            </tr>
            <tr>
              <td>Phone Stand</td>
              <td>290</td>
              <td>₭8,000</td>
              <td style={{ color: 'var(--green)', fontWeight: 700 }}>₭2,320,000</td>
            </tr>
            <tr>
              <td>Umbrella</td>
              <td>230</td>
              <td>₭35,000</td>
              <td style={{ color: 'var(--green)', fontWeight: 700 }}>₭8,050,000</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
