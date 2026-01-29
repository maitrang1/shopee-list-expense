(async function exportShopeeOrders() {
    const stats = {
        totalOrders: 0,
        totalProducts: 0,
        freeProducts: 0,
        totalSpent: 0,
        totalShipping: 0,
        totalOriginalPrice: 0,
        totalSaved: 0,
        noDateCount: 0
    };

    const csvRows = [
        'Ngày,Giờ,YYMMDD,YYMM,Mã đơn,Tên sản phẩm,Số lượng,Đơn giá gốc (VND),Đơn giá thực tế (VND),Thành tiền gốc (VND),Thành tiền thực tế (VND),Tiết kiệm (VND),Ghi chú'
    ];

    function formatNumber(num) {
        const formatted = Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return '"' + formatted + '"';
    }

    function formatYYMMDD(date) {
        const yy = String(date.getFullYear()).slice(-2);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return yy + mm + dd;
    }

    function formatYYMM(date) {
        const yy = String(date.getFullYear()).slice(-2);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        return yy + mm;
    }

    async function fetchOrders(offset = 0, limit = 20) {
        const url = `https://shopee.vn/api/v4/order/get_order_list?list_type=3&offset=${offset}&limit=${limit}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    }

    console.log('Bắt đầu lấy dữ liệu đơn hàng từ Shopee...');
    
    let offset = 0;
    const limit = 20;
    let hasMore = true;

    while (hasMore) {
        try {
            const data = await fetchOrders(offset, limit);
            
            if (!data?.data?.details_list?.length) {
                hasMore = false;
                break;
            }

            const orders = data.data.details_list;
            stats.totalOrders += orders.length;

            for (const order of orders) {
                const orderId = order.info_card?.order_id || 'N/A';
                const timestamp = order.shipping?.tracking_info?.ctime || 0;
                
                let ngayMua, gioMua, yymmdd, yymm;
                
                if (timestamp < 1000000000) {
                    ngayMua = "Không rõ";
                    gioMua = "N/A";
                    yymmdd = "N/A";
                    yymm = "N/A";
                    stats.noDateCount++;
                } else {
                    const date = new Date(timestamp * 1000);
                    ngayMua = date.toLocaleDateString('vi-VN');
                    gioMua = date.toLocaleTimeString('vi-VN', { hour12: false });
                    yymmdd = formatYYMMDD(date);
                    yymm = formatYYMM(date);
                }

                const finalTotal = (order.info_card?.final_total || 0) / 100000;
                const subtotal = (order.info_card?.subtotal || 0) / 100000;
                const shippingFee = finalTotal - subtotal;

                stats.totalSpent += finalTotal;
                stats.totalShipping += shippingFee;

                const cards = order.info_card?.order_list_cards || [];
                
                // Tính tổng giá gốc đơn hàng (chỉ dùng order_price)
                const tongGiaGocDonHang = cards.reduce((sum, c) => {
                    return sum + (c.product_info?.item_groups || []).reduce((gSum, g) => {
                        return gSum + (g.items || []).reduce((iSum, i) => {
                            return iSum + ((i.order_price || 0) / 100000) * (i.amount || 0);
                        }, 0);
                    }, 0);
                }, 0);
                
                const tyLeGiam = tongGiaGocDonHang > 0 ? subtotal / tongGiaGocDonHang : 1;
                
                for (const card of cards) {
                    const groups = card.product_info?.item_groups || [];
                    
                    for (const group of groups) {
                        const items = group.items || [];
                        
                        for (const item of items) {
                            stats.totalProducts++;
                            
                            const orderPrice = item.order_price || 0;
                            const donGiaGoc = orderPrice / 100000;
                            
                            let ghiChu = "";
                            if (donGiaGoc === 0) {
                                ghiChu = "Quà tặng - 0 VND";
                                stats.freeProducts++;
                            }
                            
                            const tenSanPham = (item.name || 'N/A').replace(/,/g, ' ').replace(/"/g, '""');
                            const soLuong = item.amount || 0;
                            
                            const donGiaThucTe = donGiaGoc * tyLeGiam;
                            const thanhTienGoc = donGiaGoc * soLuong;
                            const thanhTienThucTe = donGiaThucTe * soLuong;
                            const tietKiem = thanhTienGoc - thanhTienThucTe;
                            
                            stats.totalOriginalPrice += thanhTienGoc;
                            stats.totalSaved += tietKiem;
                            
                            csvRows.push([
                                ngayMua,
                                gioMua,
                                yymmdd,
                                yymm,
                                orderId,
                                '"' + tenSanPham + '"',
                                soLuong,
                                formatNumber(donGiaGoc),
                                formatNumber(donGiaThucTe),
                                formatNumber(thanhTienGoc),
                                formatNumber(thanhTienThucTe),
                                formatNumber(tietKiem),
                                ghiChu
                            ].join(','));
                        }
                    }
                }
            }

            console.log(`Đã xử lý ${stats.totalOrders} đơn, ${stats.totalProducts} SP (${stats.freeProducts} SP quà tặng)...`);
            offset += limit;
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error('Lỗi:', error);
            break;
        }
    }

    console.log('\n========================================');
    console.log('=== THỐNG KÊ ===');
    console.log('========================================');
    console.log(`Tổng đơn hàng: ${stats.totalOrders}`);
    console.log(`Tổng sản phẩm: ${stats.totalProducts}`);
    console.log(`  - SP có giá: ${stats.totalProducts - stats.freeProducts}`);
    console.log(`  - SP quà tặng (0đ): ${stats.freeProducts}`);
    console.log(`\n💰 TỔNG CHI TIÊU:`);
    console.log(`  - Toàn bộ: ${formatNumber(stats.totalSpent).replace(/"/g, '')} VND`);
    console.log(`  - Phí ship: ${formatNumber(stats.totalShipping).replace(/"/g, '')} VND`);
    console.log(`  - Chỉ sản phẩm: ${formatNumber(stats.totalSpent - stats.totalShipping).replace(/"/g, '')} VND`);
    console.log(`\n💵 GIÁ GỐC & TIẾT KIỆM:`);
    console.log(`  - Tổng giá gốc: ${formatNumber(stats.totalOriginalPrice).replace(/"/g, '')} VND`);
    console.log(`  - Tổng tiết kiệm: ${formatNumber(stats.totalSaved).replace(/"/g, '')} VND`);
    if (stats.noDateCount > 0) {
        console.log(`\n⏰ Đơn hàng không có ngày: ${stats.noDateCount}`);
    }
    console.log('========================================');

    const csvContent = '\ufeff' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `shopee_orders_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    
    console.log('\n✅ Đã tải file CSV!');
})();
