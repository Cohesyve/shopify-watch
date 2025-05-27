import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface ProductCardProps {
  product: {
    id: string;
    title: string;
    handle: string;
    body_html?: string;
    published_at: string;
    created_at: string;
    updated_at: string;
    vendor: string;
    product_type: string;
    tags: string[];
    variants: Array<{
      id: string;
      title: string;
      price: string;
      compare_at_price: string | null;
      option1?: string;
      option2?: string;
      option3?: string;
    }>;
    images: Array<{
      id: string;
      src: string;
      position: number;
    }>;
    currency_code?: string; // Added currency_code here
  };
}

const ProductCard = ({ product }: ProductCardProps) => {
  const mainVariant = product.variants[0];
  const mainImage = product.images?.[0]?.src || "";
  const hasDiscount = mainVariant?.compare_at_price && 
    parseFloat(mainVariant.compare_at_price) > parseFloat(mainVariant.price);

  // Strip HTML tags from description for safety
  const stripHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
  };
  
  const description = product.body_html 
    ? stripHtml(product.body_html).slice(0, 250) + (product.body_html.length > 250 ? '...' : '')
    : "";

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="relative pt-[100%] bg-gray-100">
        {mainImage ? (
          <img
            src={mainImage}
            alt={product.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            No Image
          </div>
        )}
        
        {hasDiscount && (
          <Badge className="absolute top-2 right-2 bg-red-500">
            Sale
          </Badge>
        )}
      </div>
      
      <CardHeader className="pb-2">
        <h3 className="font-medium text-sm">{product.title}</h3>
        {product.vendor && (
          <p className="text-xs text-gray-500">{product.vendor}</p>
        )}
      </CardHeader>
      
      <CardContent className="pb-2 flex-grow">
        {description && (
          <p className="text-xs text-gray-600 line-clamp-4 mt-2">{description}</p>
        )}
        
        {product.product_type && (
          <Badge variant="outline" className="mt-2 text-xs">
            {product.product_type}
          </Badge>
        )}
      </CardContent>
      
      <CardFooter className="pt-0">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold">
            {formatCurrency(mainVariant?.price || "0", product.currency_code || "USD")}
          </span>
          
          {hasDiscount && mainVariant?.compare_at_price && (
            <span className="text-sm text-gray-500 line-through">
              {formatCurrency(mainVariant.compare_at_price, product.currency_code || "USD")}
            </span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

export default ProductCard;
