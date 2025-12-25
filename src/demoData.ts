export const demoExtractedData = {
  success: true,
  source: 'google',
  businessName: 'Ogden Pizzeria',
  totalScore: 3.8,
  reviewCount: 147,
  reviews: [],
  extractionMethod: 'primary' as const
};

export const demoAnalysisData = {
  topRootCauses: [
    {
      title: 'Inconsistent Pizza Quality',
      severity: 'High' as const,
      frequency: 'Mentioned in 38% of reviews (56 reviews)',
      bullets: [
        'Pizzas arrive undercooked or overcooked depending on time of day',
        'Cheese distribution is uneven, with bare spots in the middle',
        'Crust thickness varies significantly between orders',
        'Temperature inconsistency - sometimes arrives lukewarm'
      ],
      quotes: [
        'Ordered the same pizza three times. First was perfect, second was burnt, third was undercooked. No consistency at all.',
        'The cheese was all bunched up on one side and the middle was basically just sauce and dough. Not what I expect for $22.',
        'Pizza arrived barely warm. I live 5 minutes away. Either it sat too long or your delivery bags need replacing.'
      ]
    },
    {
      title: 'Long Wait Times',
      severity: 'High' as const,
      frequency: 'Mentioned in 31% of reviews (45 reviews)',
      bullets: [
        'Quoted delivery times frequently exceed estimates by 20-40 minutes',
        'In-store pickup customers wait even when ordering ahead',
        'No communication when delays occur',
        'Friday and Saturday nights consistently problematic'
      ],
      quotes: [
        'Said 30-40 minutes. Took 75 minutes. Not even busy when I called to check.',
        'Ordered online for 6pm pickup. Didn\'t get my pizza until 6:35. What\'s the point of ordering ahead?',
        'Would have been fine with the wait if someone had just told me. Stood there for 20 minutes with no update.'
      ]
    },
    {
      title: 'Poor Phone Customer Service',
      severity: 'Medium' as const,
      frequency: 'Mentioned in 24% of reviews (35 reviews)',
      bullets: [
        'Staff seems rushed and impatient when taking phone orders',
        'Difficulty hearing/understanding over background noise',
        'Order accuracy issues - toppings wrong or missing',
        'Tone comes across as rude or dismissive'
      ],
      quotes: [
        'The person who answered was so rushed I could barely get my order in. Felt like I was bothering them.',
        'Called to place an order and could barely hear over the chaos in the background. Had to repeat myself three times.',
        'Asked a simple question about gluten-free options and got a super annoyed response. Just wanted to order pizza, not ruin someone\'s day.'
      ]
    },
    {
      title: 'Delivery Driver Issues',
      severity: 'Medium' as const,
      frequency: 'Mentioned in 19% of reviews (28 reviews)',
      bullets: [
        'Drivers frequently can\'t find the address',
        'Some drivers don\'t bring change',
        'Pizza boxes arrive tilted or damaged',
        'Drivers leave without confirming delivery at apartments'
      ],
      quotes: [
        'Driver called me three times because he couldn\'t find my building. I\'ve lived here 5 years and ordered from dozens of places with no issue.',
        'Paid with a $50 for a $31 order. Driver said he had no change. Had to Venmo him the tip.',
        'Pizza box was completely sideways when I opened my door. All the toppings had slid to one side. Inedible.'
      ]
    },
    {
      title: 'High Prices Relative to Quality',
      severity: 'Low' as const,
      frequency: 'Mentioned in 16% of reviews (24 reviews)',
      bullets: [
        'Customers feel prices don\'t match the quality delivered',
        'Delivery fees and service charges add up quickly',
        'Portion sizes smaller than expected',
        'Better value available at competitors'
      ],
      quotes: [
        'Used to love this place but $25 for a medium pizza that shows up cold? I can do better elsewhere.',
        'The pizza itself is $18, then $4 delivery fee, $3 service charge, and tip. Almost $30 for mediocre pizza.',
        'For these prices I expect perfection. What I got was average at best.'
      ]
    }
  ],
  staffCoaching: [
    {
      role: 'Phone Staff',
      focus: 'Active listening and order confirmation',
      script: 'Thanks for calling Ogden Pizzeria. Let me make sure I have your order correct - you wanted a large pepperoni with extra cheese, thin crust, for delivery to Main Street. Does that sound right? Great, we\'ll have that to you in about 35-40 minutes. Thanks for your order!'
    },
    {
      role: 'Kitchen Staff',
      focus: 'Quality consistency checks',
      script: 'Before any pizza goes in the oven, check: Is cheese evenly distributed? Is crust thickness consistent? Set a timer for exact cook time. Before boxing: Is it cooked properly? Is temperature hot? Would I be happy receiving this?'
    },
    {
      role: 'Delivery Drivers',
      focus: 'Navigation and delivery presentation',
      script: 'Before leaving, check the address in your GPS. If it\'s an apartment or complex, call the customer while en route if you\'re unsure. Keep pizzas level in insulated bags. At delivery, confirm the customer\'s name, hand them the pizza carefully, and thank them for their order.'
    },
    {
      role: 'Managers',
      focus: 'Rush hour communication',
      script: 'During Friday/Saturday rushes, check delivery estimates every 20 minutes. If we\'re running behind, call customers proactively: "Hi, this is Ogden Pizzeria. Your pizza is in the oven now and will be about 15 minutes longer than quoted. We appreciate your patience and we\'ll make sure it\'s perfect."'
    }
  ],
  processChanges: [
    {
      change: 'Implement standardized pizza-making checklist',
      why: 'Quality inconsistency is the #1 complaint. Staff needs clear, visual standards for cheese distribution, crust thickness, and cook times.',
      howTo: 'Create laminated cards with photos showing proper cheese coverage and crust specs. Post cook time charts by ovens. Require kitchen staff to initial checklist for each pizza during first 2 weeks until it becomes habit.',
      timeEstimate: '2-3 hours setup, 2 weeks training'
    },
    {
      change: 'Add 10-minute buffer to all quoted delivery times',
      why: 'Better to under-promise and over-deliver. Most delays are 10-20 minutes, so building in buffer will make you look fast instead of slow.',
      howTo: 'Update POS system and train phone staff: "If system says 30 minutes, quote 35-40 minutes." Track actual delivery times for 2 weeks to validate the buffer is sufficient.',
      timeEstimate: '30 minutes'
    },
    {
      change: 'Create quiet zone for phone orders',
      why: 'Customers can\'t hear over kitchen noise. This leads to order errors and poor impressions.',
      howTo: 'Move phone to back office or install sound barrier panel near phone station. If not possible, invest in noise-canceling headset for phone staff ($50-100).',
      timeEstimate: '1-2 hours'
    },
    {
      change: 'Require delivery drivers to carry $40 in change',
      why: 'Drivers not having change creates awkward situations and hurts tips.',
      howTo: 'Add "cash out $40 in small bills" to driver start-of-shift checklist. Keep petty cash drawer with small bills for driver change-outs.',
      timeEstimate: '15 minutes'
    }
  ],
  backlog: [
    {
      week: 'Week 1',
      task: 'Create and post pizza quality checklist in kitchen',
      effort: 'Low' as const,
      impact: 'High' as const,
      owner: 'Kitchen Manager'
    },
    {
      week: 'Week 1',
      task: 'Add 10-minute buffer to all delivery time quotes',
      effort: 'Low' as const,
      impact: 'High' as const,
      owner: 'Owner/Manager'
    },
    {
      week: 'Week 1',
      task: 'Implement $40 driver change requirement',
      effort: 'Low' as const,
      impact: 'Medium' as const,
      owner: 'Shift Manager'
    },
    {
      week: 'Week 2',
      task: 'Train all kitchen staff on consistency checklist',
      effort: 'Medium' as const,
      impact: 'High' as const,
      owner: 'Kitchen Manager'
    },
    {
      week: 'Week 2',
      task: 'Install sound barrier or headset for phone station',
      effort: 'Medium' as const,
      impact: 'Medium' as const,
      owner: 'Owner'
    },
    {
      week: 'Week 2',
      task: 'Create phone order confirmation script for staff',
      effort: 'Low' as const,
      impact: 'Medium' as const,
      owner: 'Manager'
    },
    {
      week: 'Week 3',
      task: 'Audit driver navigation skills and provide GPS training',
      effort: 'Medium' as const,
      impact: 'Medium' as const,
      owner: 'Delivery Coordinator'
    },
    {
      week: 'Week 3',
      task: 'Review and optimize oven temperatures and cook times',
      effort: 'High' as const,
      impact: 'High' as const,
      owner: 'Kitchen Manager'
    },
    {
      week: 'Week 3',
      task: 'Implement rush hour customer communication protocol',
      effort: 'Low' as const,
      impact: 'Medium' as const,
      owner: 'All Managers'
    },
    {
      week: 'Week 4',
      task: 'Test and validate quality improvements',
      effort: 'Low' as const,
      impact: 'High' as const,
      owner: 'Owner'
    },
    {
      week: 'Week 4',
      task: 'Review delivery time data and adjust buffers if needed',
      effort: 'Low' as const,
      impact: 'Medium' as const,
      owner: 'Manager'
    },
    {
      week: 'Week 4',
      task: 'Gather staff feedback on new processes',
      effort: 'Low' as const,
      impact: 'Medium' as const,
      owner: 'Owner'
    }
  ]
};
