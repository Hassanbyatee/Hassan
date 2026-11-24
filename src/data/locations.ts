export interface CityLocation {
  city: string;
  isPrimaryLaunch: boolean;
  neighborhoods: string[];
}

export const IRAQ_LOCATIONS: CityLocation[] = [
  {
    city: 'أربيل',
    isPrimaryLaunch: true,
    neighborhoods: [
      'عنكاوا',
      'بختياري',
      'إمباير وورلد',
      'شارع 100 متر',
      'شورش',
      'منارة',
      'دريم سيتي',
      'ناز سيتي',
      'برايتي',
      'ئاشتی',
      'كوران',
      'سيتى سنتر',
    ],
  },
  {
    city: 'السليمانية',
    isPrimaryLaunch: false,
    neighborhoods: [
      'سالم',
      'بختياري السليمانية',
      'رابرين',
      'سركاريز',
      'مجدي مول',
      'قلعة چوالان',
    ],
  },
  {
    city: 'دهوك',
    isPrimaryLaunch: false,
    neighborhoods: ['مازي', 'نزاركي', 'زركا', 'مالتا', 'مركز المدينة'],
  },
  {
    city: 'بغداد',
    isPrimaryLaunch: false,
    neighborhoods: [
      'المنصور',
      'الكرادة',
      'زيونة',
      'الجادرية',
      'الأعظمية',
      'الدورة',
    ],
  },
  {
    city: 'البصرة',
    isPrimaryLaunch: false,
    neighborhoods: ['العشار', 'الجزائر', 'البراضعية', 'الجبيلة', 'المعقل'],
  },
];

export function getNeighborhoodsByCity(city: string): string[] {
  const found = IRAQ_LOCATIONS.find((item) => item.city === city);
  return found ? found.neighborhoods : [];
}
