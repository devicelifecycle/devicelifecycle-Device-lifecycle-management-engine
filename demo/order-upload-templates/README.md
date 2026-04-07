# Client Demo Order Upload Templates

These CSV files are ready to upload in the app as-is.

Files:
- `trade-in-client-demo.csv`
- `cpo-client-demo.csv`
- `trade-in-upload-template.csv`
- `cpo-upload-template.csv`

What each file shows:
- `trade-in-client-demo.csv`: demonstrates condition-based pricing using the same model family across `excellent`, `good`, `fair`, and `poor`
- `cpo-client-demo.csv`: demonstrates a bulk CPO sourcing request with multiple quantities and storage variants
- `trade-in-upload-template.csv`: blank trade-in upload template with the exact accepted headers
- `cpo-upload-template.csv`: blank CPO upload template with the exact accepted headers

Recommended demo flow:
1. Upload [trade-in-client-demo.csv](/Users/saiyaganti/Device-lifecycle-management-engine/demo/order-upload-templates/trade-in-client-demo.csv)
2. Explain that the system matches `device_make + device_model + storage + condition`
3. Show how quote values change by condition
4. Submit the trade-in order and explain quote acceptance + inbound shipment flow
5. Upload [cpo-client-demo.csv](/Users/saiyaganti/Device-lifecycle-management-engine/demo/order-upload-templates/cpo-client-demo.csv)
6. Explain that CPO uses `quantity + model + storage` and then moves into sourcing/vendor bidding
7. Submit the CPO order and explain vendor assignment + fulfillment workflow

Accepted headers used here:
- Trade-in: `device_make, device_model, quantity, condition, storage, serial_number, color, notes`
- CPO: `device_make, device_model, quantity, storage, notes`

These match the shared template definitions in:
- [csv-templates.ts](/Users/saiyaganti/Device-lifecycle-management-engine/src/lib/csv-templates.ts)
