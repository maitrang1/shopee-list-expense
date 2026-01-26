(async function exportShopeeOrders() {
    const stats = {
        totalOrders: 0,
        totalProducts: 0,
        totalSpent: 0,
        totalShipping: 0,
        totalOriginalPrice: 0,
        totalSaved: 0,
        noDateCount: 0
    };

    const csvRows = [
        'Ngày,Giờ,YYMMDD,YYMM,Mã đơn,Tên sản phẩm,Số lượng,Đơn giá gốc (k VND),Thành tiền gốc (k VND),Thành tiền thực tế (k VND),Tiết kiệm (k VND)'
    ];

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
                
                for (const card of cards) {
                    const groups = card.product_info?.item_groups || [];
                    
                    for (const group of groups) {
                        const items = group.items || [];
                        
                        for (const item of items) {
                            stats.totalProducts++;
                            
                            const tenSanPham = (item.name || 'N/A').replace(/,/g, ' ');
                            const soLuong = item.amount || 0;
                            const donGiaGoc = (item.price_before_discount || 0) / 100000;
                            const thanhTienGoc = donGiaGoc * soLuong;
                            
                            stats.totalOriginalPrice += thanhTienGoc;
                            
                            const tongGiaGocDonHang = cards.reduce((sum, c) => {
                                return sum + (c.product_info?.item_groups || []).reduce((gSum, g) => {
                                    return gSum + (g.items || []).reduce((iSum, i) => {
                                        return iSum + ((i.price_before_discount || 0) / 100000) * (i.amount || 0);
                                    }, 0);
                                }, 0);
                            }, 0);
                            
                            const tyLeGiam = tongGiaGocDonHang > 0 ? subtotal / tongGiaGocDonHang : 1;
                            const thanhTienThucTe = thanhTienGoc * tyLeGiam;
                            const tietKiem = thanhTienGoc - thanhTienThucTe;
                            
                            stats.totalSaved += tietKiem;
                            
                            csvRows.push([
                                ngayMua,
                                gioMua,
                                yymmdd,
                                yymm,
                                orderId,
                                tenSanPham,
                                soLuong,
                                donGiaGoc.toFixed(1),
                                thanhTienGoc.toFixed(1),
                                thanhTienThucTe.toFixed(1),
                                tietKiem.toFixed(1)
                            ].join(','));
                        }
                    }
                }
            }

            console.log(`Đã xử lý ${stats.totalOrders} đơn hàng, ${stats.totalProducts} sản phẩm...`);
            offset += limit;
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error('Lỗi:', error);
            break;
        }
    }

    console.log('\n=== THỐNG KÊ ===');
    console.log(`Tổng đơn hàng: ${stats.totalOrders}`);
    console.log(`Tổng sản phẩm: ${stats.totalProducts}`);
    console.log(`Tổng chi tiêu: ${stats.totalSpent.toFixed(0)}k VND (bao gồm ship ${stats.totalShipping.toFixed(0)}k)`);
    console.log(`Tổng giá gốc: ${stats.totalOriginalPrice.toFixed(0)}k VND`);
    console.log(`Tổng tiết kiệm: ${stats.totalSaved.toFixed(0)}k VND`);
    if (stats.noDateCount > 0) {
        console.log(`Đơn hàng không có ngày: ${stats.noDateCount}`);
    }

    const csvContent = '\ufeff' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `shopee_orders_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    
    console.log('\nĐã tải file CSV!');
})();
