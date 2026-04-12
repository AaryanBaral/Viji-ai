-- =====================================================
-- AUTO RESPONSES SEED DATA
-- Bilingual (English/Nepali) chatbot responses
-- Total Records: 20 common responses
-- =====================================================

-- Clear existing data (optional)
-- DELETE FROM auto_responses;

-- Insert auto responses
INSERT INTO auto_responses (
    trigger_keyword, 
    response_en, 
    response_ne, 
    category, 
    is_active
) VALUES
-- Greetings
('greeting', 
'Hello! Welcome to our vehicle parts store. How can I help you today?', 
'नमस्कार! हाम्रो वाहन पार्टको पसलमा स्वागत छ। म तपाईंलाई आज कसरी मद्दत गर्न सक्छु?', 
'greeting', 
true),

('hello', 
'Hi there! I''m here to help you find the right vehicle parts. What are you looking for?', 
'नमस्ते! म तपाईंलाई सही वाहन पार्ट फेला पार्न मद्दत गर्न यहाँ छु। तपाईं के खोज्दै हुनुहुन्छ?', 
'greeting', 
true),

-- Product Queries
('price', 
'Let me check the current price for you. Please provide the product code or vehicle details.', 
'तपाईंको लागि हालको मूल्य जाँच गरौं। कृपया उत्पादन कोड वा वाहन विवरण प्रदान गर्नुहोस्।', 
'product', 
true),

('stock', 
'I''ll check the stock availability for you. Which product are you interested in?', 
'म तपाईंको लागि स्टक उपलब्धता जाँच गर्नेछु। तपाईं कुन उत्पादनमा रुचि राख्नुहुन्छ?', 
'product', 
true),

('availability', 
'To check availability, please tell me the product name or code, and your vehicle make and model.', 
'उपलब्धता जाँच गर्न, कृपया मलाई उत्पादनको नाम वा कोड, र तपाईंको वाहनको मेक र मोडेल बताउनुहोस्।', 
'product', 
true),

-- Vehicle Parts
('brake', 
'We have a wide range of brake pads and discs. What''s your vehicle make and model?', 
'हामीसँग ब्रेक प्याड र डिस्कको विस्तृत दायरा छ। तपाईंको वाहनको मेक र मोडेल के हो?', 
'product', 
true),

('filter', 
'We stock oil filters, air filters, and fuel filters. Which type do you need for your vehicle?', 
'हामीसँग तेल फिल्टर, एयर फिल्टर र इन्धन फिल्टर छ। तपाईंको वाहनको लागि कुन प्रकार चाहिन्छ?', 
'product', 
true),

('oil', 
'We have engine oils from trusted brands like Castrol and Mobil. What viscosity grade do you need?', 
'हामीसँग Castrol र Mobil जस्ता विश्वसनीय ब्रान्डका इन्जिन तेलहरू छन्। तपाईंलाई कुन भिस्कोसिटी ग्रेड चाहिन्छ?', 
'product', 
true),

-- Order Process
('order', 
'To place an order, I''ll need your customer code or phone number. Do you have a customer account with us?', 
'अर्डर गर्नको लागि, मलाई तपाईंको ग्राहक कोड वा फोन नम्बर चाहिन्छ। के तपाईंसँग हामीसँग ग्राहक खाता छ?', 
'order', 
true),

('delivery', 
'We deliver to most major cities in Nepal. Where would you like the parts delivered?', 
'हामी नेपालका अधिकांश प्रमुख शहरहरूमा डेलिभरी गर्छौं। तपाईं पार्ट कहाँ डेलिभर गर्न चाहनुहुन्छ?', 
'order', 
true),

('payment', 
'We accept cash, bank transfer, and offer credit terms for registered customers. What payment method works best for you?', 
'हामी नगद, बैंक स्थानान्तरण स्वीकार गर्छौं, र दर्ता गरिएका ग्राहकहरूको लागि क्रेडिट सर्तहरू प्रस्ताव गर्छौं। तपाईंको लागि कुन भुक्तानी विधि राम्रो हुन्छ?', 
'order', 
true),

-- Customer Account
('discount', 
'Your discount depends on your customer grade (LEO, HRS, CAT, TORT, or PUBLIC). Let me check your account details.', 
'तपाईंको छुट तपाईंको ग्राहक ग्रेड (LEO, HRS, CAT, TORT, वा PUBLIC) मा निर्भर गर्दछ। म तपाईंको खाता विवरण जाँच गरौं।', 
'customer', 
true),

('account', 
'To check your account, please provide your customer code or the phone number registered with us.', 
'तपाईंको खाता जाँच गर्न, कृपया तपाईंको ग्राहक कोड वा हामीसँग दर्ता गरिएको फोन नम्बर प्रदान गर्नुहोस्।', 
'customer', 
true),

('balance', 
'I can check your account balance. Please share your customer code.', 
'म तपाईंको खाता ब्यालेन्स जाँच गर्न सक्छु। कृपया तपाईंको ग्राहक कोड साझा गर्नुहोस्।', 
'customer', 
true),

-- Workshop Finder
('workshop', 
'Looking for a workshop? I can help you find authorized workshops nearby. Please share your location or city.', 
'कार्यशाला खोज्दै हुनुहुन्छ? म तपाईंलाई नजिकैको अधिकृत कार्यशालाहरू फेला पार्न मद्दत गर्न सक्छु। कृपया तपाईंको स्थान वा शहर साझा गर्नुहोस्।', 
'workshop', 
true),

('mechanic', 
'I can recommend trusted workshops with experienced mechanics in your area. Which city are you in?', 
'म तपाईंको क्षेत्रमा अनुभवी मेकानिकहरू भएका विश्वसनीय कार्यशालाहरू सिफारिस गर्न सक्छु। तपाईं कुन शहरमा हुनुहुन्छ?', 
'workshop', 
true),

-- Help and Support
('help', 
'I can assist you with: 1) Finding products, 2) Checking prices, 3) Placing orders, 4) Finding workshops. What would you like to do?', 
'म तपाईंलाई यी कुरामा सहयोग गर्न सक्छु: १) उत्पादन खोज्ने, २) मूल्य जाँच्ने, ३) अर्डर गर्ने, ४) कार्यशाला खोज्ने। तपाईं के गर्न चाहनुहुन्छ?', 
'support', 
true),

('contact', 
'You can reach us at: Phone: +977-1-XXXXXXX, Email: sales@ltvs.com.np. Or continue chatting here, I''m here to help!', 
'तपाईं हामीलाई यहाँ सम्पर्क गर्न सक्नुहुन्छ: फोन: +977-1-XXXXXXX, इमेल: sales@ltvs.com.np। वा यहाँ कुराकानी जारी राख्नुहोस्, म मद्दतको लागि यहाँ छु!', 
'support', 
true),

-- Common Issues
('return', 
'For returns and exchanges, please contact our sales team with your order number. Returns are accepted within 7 days for defective items.', 
'फिर्ता र आदानप्रदानको लागि, कृपया तपाईंको अर्डर नम्बरको साथ हाम्रो बिक्री टोलीलाई सम्पर्क गर्नुहोस्। दोषपूर्ण वस्तुहरूको लागि ७ दिन भित्र फिर्ता स्वीकार गरिन्छ।', 
'support', 
true),

('warranty', 
'Most of our genuine parts come with manufacturer warranty. Warranty period varies by product. Which product are you asking about?', 
'हाम्रा अधिकांश वास्तविक पार्टहरू निर्माता वारेन्टीको साथ आउँछन्। वारेन्टी अवधि उत्पादन अनुसार फरक हुन्छ। तपाईं कुन उत्पादनको बारेमा सोध्दै हुनुहुन्छ?', 
'support', 
true);

-- Verification query
-- SELECT category, COUNT(*) as count FROM auto_responses WHERE is_active = true GROUP BY category;
-- SELECT * FROM auto_responses ORDER BY category, trigger_keyword;
